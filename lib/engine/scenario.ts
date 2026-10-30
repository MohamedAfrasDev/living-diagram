// The scenario: the numbers the engine runs on (docs/04-scenario-pack.md,
// docs/10-your-numbers.md). DEFAULT_SCENARIO holds the template numbers; a
// developer may enter their own within the bounds below. Entered numbers are
// inputs, not measurements. The shape stays fixed: five services, the same
// request path (D-007), the same four settings.

export const NODE_IDS = ["gateway", "order", "cache", "payment", "db"] as const;
export type NodeId = (typeof NODE_IDS)[number];

export interface NodeSpec {
  concurrency: number;
  queueCapacity: number;
  localMs: number;
}

export interface Scenario {
  nodes: Record<NodeId, NodeSpec>;
  // One request every N ms for the fixed 10-second arrival window.
  arrivalIntervalMs: number;
  // Share of requests that miss the cache and also read DB, 0 to 1 in steps of 0.01.
  cacheMissRate: number;
  // How many times slower Payment is when the fault is on.
  faultFactor: number;
}

function deepFreeze<T extends object>(value: T): T {
  for (const key of Object.keys(value)) {
    const inner = (value as Record<string, unknown>)[key];
    if (typeof inner === "object" && inner !== null) deepFreeze(inner);
  }
  return Object.freeze(value);
}

export const DEFAULT_SCENARIO: Scenario = deepFreeze({
  nodes: {
    gateway: { concurrency: 100, queueCapacity: 100, localMs: 2 },
    order: { concurrency: 50, queueCapacity: 40, localMs: 5 }, // D-014/D-015 option A
    cache: { concurrency: 50, queueCapacity: 0, localMs: 1 },
    payment: { concurrency: 10, queueCapacity: 20, localMs: 20 },
    db: { concurrency: 20, queueCapacity: 40, localMs: 10 },
  },
  arrivalIntervalMs: 20, // 50 requests per second (D-015 option A)
  cacheMissRate: 0.25,
  faultFactor: 20,
});

export const SCENARIO_BOUNDS = {
  concurrency: { min: 1, max: 500 },
  queueCapacity: { min: 0, max: 500 },
  localMs: { min: 1, max: 2000 },
  arrivalIntervalMs: { min: 10, max: 200 },
  cacheMissRate: { min: 0, max: 1 },
  faultFactor: { min: 2, max: 50 },
} as const;

export const ARRIVAL_WINDOW_MS = 10_000;

// Requests offered in the arrival window.
export function arrivalCount(s: Scenario): number {
  return Math.floor(ARRIVAL_WINDOW_MS / s.arrivalIntervalMs);
}

// A copy with keys in a fixed order, so hashing and comparison never depend on
// how the caller built the object.
export function canonicalScenario(s: Scenario): Scenario {
  const node = (n: NodeSpec): NodeSpec => ({ concurrency: n.concurrency, queueCapacity: n.queueCapacity, localMs: n.localMs });
  return {
    nodes: { gateway: node(s.nodes.gateway), order: node(s.nodes.order), cache: node(s.nodes.cache), payment: node(s.nodes.payment), db: node(s.nodes.db) },
    arrivalIntervalMs: s.arrivalIntervalMs,
    cacheMissRate: s.cacheMissRate,
    faultFactor: s.faultFactor,
  };
}

export function isDefaultScenario(s: Scenario): boolean {
  return JSON.stringify(canonicalScenario(s)) === JSON.stringify(canonicalScenario(DEFAULT_SCENARIO));
}

export type ScenarioCheck = { ok: true; scenario: Scenario } | { ok: false; field: string; message: string };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);

const bad = (field: string, message: string): { ok: false; field: string; message: string } => ({ ok: false, field, message });

function intField(value: unknown, field: string, b: { min: number; max: number }): { ok: false; field: string; message: string } | null {
  if (!isInt(value) || value < b.min || value > b.max) return bad(field, `must be an integer from ${b.min} to ${b.max}`);
  return null;
}

// Validates untrusted input. Out-of-range values are an error, never clamped.
export function validateScenario(input: unknown): ScenarioCheck {
  if (!isRecord(input)) return bad("scenario", "must be an object");
  const topKeys = ["nodes", "arrivalIntervalMs", "cacheMissRate", "faultFactor"];
  for (const key of Object.keys(input)) if (!topKeys.includes(key)) return bad(key, "is not a scenario field");
  const { nodes } = input;
  if (!isRecord(nodes)) return bad("nodes", "must be an object with the five services");
  for (const key of Object.keys(nodes)) if (!(NODE_IDS as readonly string[]).includes(key)) return bad(`nodes.${key}`, "is not one of the five services");
  const parsed: Partial<Record<NodeId, NodeSpec>> = {};
  for (const id of NODE_IDS) {
    const n = nodes[id];
    if (!isRecord(n)) return bad(`nodes.${id}`, "is required: workers, queue size and time per request");
    for (const key of Object.keys(n)) if (!["concurrency", "queueCapacity", "localMs"].includes(key)) return bad(`nodes.${id}.${key}`, "is not a service field");
    const checks = [
      intField(n.concurrency, `nodes.${id}.concurrency`, SCENARIO_BOUNDS.concurrency),
      intField(n.queueCapacity, `nodes.${id}.queueCapacity`, SCENARIO_BOUNDS.queueCapacity),
      intField(n.localMs, `nodes.${id}.localMs`, SCENARIO_BOUNDS.localMs),
    ];
    for (const c of checks) if (c) return c;
    parsed[id] = { concurrency: n.concurrency as number, queueCapacity: n.queueCapacity as number, localMs: n.localMs as number };
  }
  const interval = intField(input.arrivalIntervalMs, "arrivalIntervalMs", SCENARIO_BOUNDS.arrivalIntervalMs);
  if (interval) return interval;
  const rate = input.cacheMissRate;
  const rb = SCENARIO_BOUNDS.cacheMissRate;
  if (typeof rate !== "number" || !Number.isFinite(rate) || rate < rb.min || rate > rb.max || Math.abs(rate * 100 - Math.round(rate * 100)) > 1e-9) {
    return bad("cacheMissRate", "must be a number from 0 to 1 in steps of 0.01");
  }
  const factor = intField(input.faultFactor, "faultFactor", SCENARIO_BOUNDS.faultFactor);
  if (factor) return factor;
  return {
    ok: true,
    scenario: canonicalScenario({
      nodes: parsed as Record<NodeId, NodeSpec>,
      arrivalIntervalMs: input.arrivalIntervalMs as number,
      cacheMissRate: rate,
      faultFactor: input.faultFactor as number,
    }),
  };
}

// Same-tick completion order: downstream nodes first (docs/05 section 5).
export const COMPLETION_RANK: Record<NodeId, number> = {
  db: 0,
  payment: 1,
  cache: 2,
  order: 3,
  gateway: 4,
};

export const HORIZON_MS = 15_000;
export const RETRY_BACKOFF_MS = 50;
export const BREAKER_FAILURE_THRESHOLD = 5;
export const BREAKER_OPEN_MS = 2000;
export const MAX_EVENTS = 200_000;
export const ENGINE_VERSION = "1.0";

export const KNOB_DOMAIN = {
  timeoutMs: { min: 50, max: 5000 },
  retries: { min: 0, max: 5 },
  bulkhead: { min: 1, max: 20 },
} as const;

// The template numbers under their old names, for code that only ever shows or
// uses the default scenario. Anything that depends on the scenario in use must
// read it from the scenario instead.
export const NODES: Record<NodeId, NodeSpec> = DEFAULT_SCENARIO.nodes;
export const ARRIVAL_INTERVAL_MS = DEFAULT_SCENARIO.arrivalIntervalMs;
export const ARRIVAL_COUNT = arrivalCount(DEFAULT_SCENARIO);
export const CACHE_MISS_RATE = DEFAULT_SCENARIO.cacheMissRate;
