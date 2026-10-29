// Deterministic tick-based simulator for the slow-payment scenario.
// Semantics: docs/05-engine-semantics.md. Plain TypeScript: no network, no
// model calls, no wall clock, never imports the agent package.
import { fnv1a, mulberry32 } from "./rng";
import {
  ARRIVAL_COUNT,
  ARRIVAL_INTERVAL_MS,
  BREAKER_FAILURE_THRESHOLD,
  BREAKER_OPEN_MS,
  CACHE_MISS_RATE,
  COMPLETION_RANK,
  ENGINE_VERSION,
  HORIZON_MS,
  KNOB_DOMAIN,
  MAX_EVENTS,
  NODE_IDS,
  NODES,
  RETRY_BACKOFF_MS,
  type NodeId,
} from "./scenario";

export interface Knobs {
  timeoutMs: number;
  retries: number;
  circuitBreaker: boolean;
  bulkhead: number | null;
}

export type FailureCode = "QUEUE_FULL" | "TIMEOUT" | "BULKHEAD_FULL";
export type EngineErrorCode = "INVALID_KNOBS" | "INVALID_FAULT";

export class EngineError extends Error {
  readonly code: EngineErrorCode;
  constructor(code: EngineErrorCode, message: string) {
    super(message);
    this.name = "EngineError";
    this.code = code;
  }
}

export interface SimulateInput {
  seed: number;
  knobs: Knobs;
  paymentSlowdown: number;
  recordEvents?: boolean;
}

export type EventType =
  | "arrive"
  | "queued"
  | "start"
  | "rejected"
  | "done"
  | "failed"
  | "timeout"
  | "retry"
  | "degraded"
  | "breaker_open"
  | "breaker_half_open"
  | "breaker_closed";

export interface EngineEvent {
  t: number;
  type: EventType;
  node: NodeId;
  requestId: number;
  visitId: number;
  code?: FailureCode;
}

export interface NodeMetrics {
  occupiedSlotFraction: number;
  timeWeightedQueueDepth: number;
  peakQueue: number;
  rejected: number;
}

export interface SimulationResult {
  status: "complete" | "incomplete";
  engineVersion: string;
  offered: number;
  succeeded: number;
  degraded: number;
  failed: number;
  outstanding: number;
  errorRate: number;
  degradedRate: number;
  failuresByCode: Record<FailureCode, number>;
  latencyMs: { p50: number | null; p95: number | null; max: number | null; samples: number };
  paymentAttemptsPerRequest: number;
  nodes: Record<NodeId, NodeMetrics>;
  runHash: string;
  events?: EngineEvent[];
}

interface Request {
  id: number;
  arrivalMs: number;
  cacheMiss: boolean;
  settled: boolean;
}

interface Attempt {
  order: Visit;
  resolved: boolean;
  probe: boolean;
}

interface Visit {
  id: number;
  node: NodeId;
  req: Request;
  parent: Visit | null;
  attempt: Attempt | null;
  pc: number;
  finishAt: number;
  degraded: boolean;
  attemptsUsed: number;
  holdsSlot: boolean;
}

type Outcome = { ok: true; degraded: boolean } | { ok: false; code: FailureCode };
type Action = { kind: "call"; node: NodeId } | { kind: "payment" };

interface NodeState {
  busy: number;
  queue: Visit[];
  busySlotMs: number;
  queueMs: number;
  peakQueue: number;
  rejected: number;
}

type BreakerState = "closed" | "open" | "half-open";

function isInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

// Returns a message when the knobs are outside the documented domain
// (docs/04-scenario-pack.md), or null when valid.
export function knobsError(knobs: Knobs): string | null {
  const d = KNOB_DOMAIN;
  if (!isInt(knobs.timeoutMs) || knobs.timeoutMs < d.timeoutMs.min || knobs.timeoutMs > d.timeoutMs.max) {
    return `timeoutMs must be an integer in ${d.timeoutMs.min}..${d.timeoutMs.max}`;
  }
  if (!isInt(knobs.retries) || knobs.retries < d.retries.min || knobs.retries > d.retries.max) {
    return `retries must be an integer in ${d.retries.min}..${d.retries.max}`;
  }
  if (typeof knobs.circuitBreaker !== "boolean") return "circuitBreaker must be a boolean";
  if (
    knobs.bulkhead !== null &&
    (!isInt(knobs.bulkhead) || knobs.bulkhead < d.bulkhead.min || knobs.bulkhead > d.bulkhead.max)
  ) {
    return `bulkhead must be null or an integer in ${d.bulkhead.min}..${d.bulkhead.max}`;
  }
  return null;
}

function validate(input: SimulateInput): void {
  const { knobs, paymentSlowdown, seed } = input;
  if (!isInt(seed)) throw new EngineError("INVALID_KNOBS", "seed must be an integer");
  const message = knobsError(knobs);
  if (message) throw new EngineError("INVALID_KNOBS", message);
  if (paymentSlowdown !== 1 && paymentSlowdown !== 20) {
    throw new EngineError("INVALID_FAULT", "paymentSlowdown must be 1 or 20");
  }
}

function program(v: Visit): Action[] {
  switch (v.node) {
    case "gateway":
      return [{ kind: "call", node: "order" }];
    case "order":
      return v.req.cacheMiss
        ? [{ kind: "call", node: "cache" }, { kind: "call", node: "db" }, { kind: "payment" }]
        : [{ kind: "call", node: "cache" }, { kind: "payment" }];
    case "payment":
      return [{ kind: "call", node: "db" }];
    default:
      return [];
  }
}

export function simulate(input: SimulateInput): SimulationResult {
  validate(input);
  const { knobs, paymentSlowdown, seed } = input;
  const horizon = HORIZON_MS;
  const rng = mulberry32(seed);
  const events: EngineEvent[] | null = input.recordEvents ? [] : null;

  let t = 0;
  let eventCount = 0;
  let nextVisitId = 1;
  let paymentAttempts = 0;
  let inflightAttempts = 0;

  const newNodeState = (): NodeState => ({ busy: 0, queue: [], busySlotMs: 0, queueMs: 0, peakQueue: 0, rejected: 0 });
  const ns: Record<NodeId, NodeState> = {
    gateway: newNodeState(),
    order: newNodeState(),
    cache: newNodeState(),
    payment: newNodeState(),
    db: newNodeState(),
  };

  const completions = new Map<number, Visit[]>();
  const timeouts = new Map<number, Attempt[]>();
  const backoffs = new Map<number, Visit[]>();
  const breaker = { state: "closed" as BreakerState, consecutive: 0, openUntil: 0, probeInFlight: false };

  let succeeded = 0;
  let degraded = 0;
  let failed = 0;
  const failuresByCode: Record<FailureCode, number> = { QUEUE_FULL: 0, TIMEOUT: 0, BULKHEAD_FULL: 0 };
  const latencies: number[] = [];

  const push = <K, V>(map: Map<K, V[]>, key: K, value: V): void => {
    const list = map.get(key);
    if (list) list.push(value);
    else map.set(key, [value]);
  };

  const ev = (type: EventType, v: Visit | null, node: NodeId, code?: FailureCode): void => {
    eventCount++;
    if (events) {
      events.push({ t, type, node, requestId: v ? v.req.id : 0, visitId: v ? v.id : 0, ...(code ? { code } : {}) });
    }
  };

  const start = (v: Visit): void => {
    const n = ns[v.node];
    n.busy++;
    v.holdsSlot = true;
    const slowdown = v.node === "payment" ? paymentSlowdown : 1;
    v.finishAt = t + NODES[v.node].localMs * slowdown;
    push(completions, v.finishAt, v);
    ev("start", v, v.node);
  };

  const release = (v: Visit): void => {
    const n = ns[v.node];
    n.busy--;
    v.holdsSlot = false;
    while (n.busy < NODES[v.node].concurrency && n.queue.length > 0) {
      const next = n.queue.shift();
      if (next) start(next);
    }
  };

  const settleRequest = (v: Visit, outcome: Outcome): void => {
    v.req.settled = true;
    if (outcome.ok) {
      if (outcome.degraded) {
        degraded++;
      } else {
        succeeded++;
        latencies.push(t - v.req.arrivalMs);
      }
      ev("done", v, v.node);
    } else {
      failed++;
      failuresByCode[outcome.code]++;
      ev("failed", v, v.node, outcome.code);
    }
  };

  const advance = (v: Visit): void => {
    const action = program(v)[v.pc];
    if (!action) {
      finishVisit(v, { ok: true, degraded: v.degraded });
      return;
    }
    v.pc++;
    if (action.kind === "call") callNode(v, action.node, v.req, null);
    else startAttempt(v);
  };

  const receive = (parent: Visit, outcome: Outcome): void => {
    if (outcome.ok) {
      if (outcome.degraded) parent.degraded = true;
      advance(parent);
    } else {
      finishVisit(parent, outcome);
    }
  };

  const deliver = (v: Visit, outcome: Outcome): void => {
    if (v.attempt) {
      // Result of a Payment attempt. A timed-out attempt was abandoned (D-006):
      // its work ran to completion but its result is discarded.
      const attempt = v.attempt;
      if (attempt.resolved) return;
      if (outcome.ok) attemptSucceeded(attempt);
      else attemptFailed(attempt, outcome.code);
      return;
    }
    if (v.parent) {
      receive(v.parent, outcome);
      return;
    }
    settleRequest(v, outcome);
  };

  const finishVisit = (v: Visit, outcome: Outcome): void => {
    if (v.holdsSlot) release(v);
    deliver(v, outcome);
  };

  const callNode = (parent: Visit | null, node: NodeId, req: Request, attempt: Attempt | null): void => {
    const v: Visit = {
      id: nextVisitId++,
      node,
      req,
      parent,
      attempt,
      pc: 0,
      finishAt: 0,
      degraded: false,
      attemptsUsed: 0,
      holdsSlot: false,
    };
    const spec = NODES[node];
    const n = ns[node];
    if (n.busy < spec.concurrency) {
      start(v);
    } else if (n.queue.length < spec.queueCapacity) {
      n.queue.push(v);
      if (n.queue.length > n.peakQueue) n.peakQueue = n.queue.length;
      ev("queued", v, node);
    } else {
      n.rejected++;
      ev("rejected", v, node, "QUEUE_FULL");
      deliver(v, { ok: false, code: "QUEUE_FULL" });
    }
  };

  const openBreaker = (): void => {
    breaker.state = "open";
    breaker.openUntil = t + BREAKER_OPEN_MS;
    breaker.consecutive = 0;
    breaker.probeInFlight = false;
    ev("breaker_open", null, "order");
  };

  const startAttempt = (order: Visit): void => {
    let probe = false;
    if (knobs.circuitBreaker) {
      if (breaker.state === "open" || (breaker.state === "half-open" && breaker.probeInFlight)) {
        order.degraded = true;
        ev("degraded", order, "order");
        finishVisit(order, { ok: true, degraded: true });
        return;
      }
      if (breaker.state === "half-open") {
        probe = true;
        breaker.probeInFlight = true;
      }
    }
    if (knobs.bulkhead !== null && inflightAttempts >= knobs.bulkhead) {
      ev("failed", order, "order", "BULKHEAD_FULL");
      finishVisit(order, { ok: false, code: "BULKHEAD_FULL" });
      return;
    }
    const attempt: Attempt = { order, resolved: false, probe };
    order.attemptsUsed++;
    paymentAttempts++;
    inflightAttempts++;
    push(timeouts, t + knobs.timeoutMs, attempt);
    callNode(order, "payment", order.req, attempt);
  };

  const attemptSucceeded = (attempt: Attempt): void => {
    attempt.resolved = true;
    inflightAttempts--;
    if (knobs.circuitBreaker) {
      if (attempt.probe) {
        breaker.state = "closed";
        breaker.probeInFlight = false;
        ev("breaker_closed", null, "order");
      }
      if (breaker.state === "closed") breaker.consecutive = 0;
    }
    advance(attempt.order);
  };

  const attemptFailed = (attempt: Attempt, code: FailureCode): void => {
    attempt.resolved = true;
    inflightAttempts--;
    if (knobs.circuitBreaker) {
      if (attempt.probe) {
        openBreaker();
      } else if (breaker.state === "closed") {
        breaker.consecutive++;
        if (breaker.consecutive >= BREAKER_FAILURE_THRESHOLD) openBreaker();
      }
    }
    const order = attempt.order;
    const retryable = code === "TIMEOUT" || code === "QUEUE_FULL";
    if (retryable && order.attemptsUsed < 1 + knobs.retries) {
      ev("retry", order, "order", code);
      push(backoffs, t + RETRY_BACKOFF_MS, order);
      return;
    }
    finishVisit(order, { ok: false, code });
  };

  const byRequest = <T>(key: (item: T) => number) => (a: T, b: T) => key(a) - key(b);

  let incomplete = false;
  for (t = 0; t <= horizon; t++) {
    // 1. Attempt deadlines, then retry backoffs expiring, in request-ID order.
    const dueTimeouts = timeouts.get(t);
    if (dueTimeouts) {
      timeouts.delete(t);
      dueTimeouts.sort(byRequest((a: Attempt) => a.order.req.id));
      for (const attempt of dueTimeouts) {
        if (attempt.resolved) continue;
        ev("timeout", attempt.order, "payment", "TIMEOUT");
        attemptFailed(attempt, "TIMEOUT");
      }
    }
    const dueBackoffs = backoffs.get(t);
    if (dueBackoffs) {
      backoffs.delete(t);
      dueBackoffs.sort(byRequest((v: Visit) => v.req.id));
      for (const order of dueBackoffs) startAttempt(order);
    }

    // 2. Completions: downstream nodes first, then by request ID.
    const due = completions.get(t);
    if (due) {
      completions.delete(t);
      due.sort((a, b) => COMPLETION_RANK[a.node] - COMPLETION_RANK[b.node] || a.req.id - b.req.id || a.id - b.id);
      for (const v of due) advance(v);
    }

    // 3. Circuit breaker: open becomes half-open when the open window ends.
    if (breaker.state === "open" && t >= breaker.openUntil) {
      breaker.state = "half-open";
      breaker.probeInFlight = false;
      ev("breaker_half_open", null, "order");
    }

    // 4. New arrivals at the gateway.
    if (t % ARRIVAL_INTERVAL_MS === 0 && t / ARRIVAL_INTERVAL_MS < ARRIVAL_COUNT) {
      const req: Request = {
        id: t / ARRIVAL_INTERVAL_MS + 1,
        arrivalMs: t,
        cacheMiss: rng() < CACHE_MISS_RATE,
        settled: false,
      };
      ev("arrive", null, "gateway");
      callNode(null, "gateway", req, null);
    }

    if (t < horizon) {
      for (const id of NODE_IDS) {
        ns[id].busySlotMs += ns[id].busy;
        ns[id].queueMs += ns[id].queue.length;
      }
    }
    if (eventCount > MAX_EVENTS) {
      incomplete = true;
      break;
    }
  }

  const offered = ARRIVAL_COUNT;
  const settled = succeeded + degraded + failed;
  const sorted = [...latencies].sort((a, b) => a - b);
  const percentile = (p: number): number | null =>
    sorted.length === 0 ? null : sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)];

  const nodes = Object.fromEntries(
    NODE_IDS.map((id) => [
      id,
      {
        occupiedSlotFraction: ns[id].busySlotMs / (NODES[id].concurrency * horizon),
        timeWeightedQueueDepth: ns[id].queueMs / horizon,
        peakQueue: ns[id].peakQueue,
        rejected: ns[id].rejected,
      },
    ]),
  ) as Record<NodeId, NodeMetrics>;

  const body = {
    status: (incomplete ? "incomplete" : "complete") as SimulationResult["status"],
    engineVersion: ENGINE_VERSION,
    offered,
    succeeded,
    degraded,
    failed,
    outstanding: offered - settled,
    errorRate: failed / offered,
    degradedRate: degraded / offered,
    failuresByCode,
    latencyMs: {
      p50: percentile(50),
      p95: percentile(95),
      max: sorted.length === 0 ? null : sorted[sorted.length - 1],
      samples: sorted.length,
    },
    paymentAttemptsPerRequest: paymentAttempts / offered,
    nodes,
  };
  const result: SimulationResult = { ...body, runHash: fnv1a(JSON.stringify({ seed, knobs, paymentSlowdown, body })) };
  if (events) result.events = events;
  return result;
}
