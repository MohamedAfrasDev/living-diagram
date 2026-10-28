import { describe, expect, test } from "vitest";
import { simulate, EngineError, type Knobs, type SimulationResult } from "./simulate";
import { HORIZON_MS, NODES, NODE_IDS } from "./scenario";

const DEFAULT_KNOBS: Knobs = { timeoutMs: 1000, retries: 0, circuitBreaker: false, bulkhead: null };

const CONFIGS: { name: string; knobs: Partial<Knobs>; slow: number }[] = [
  { name: "baseline", knobs: {}, slow: 1 },
  { name: "fault", knobs: {}, slow: 20 },
  { name: "retries=3", knobs: { retries: 3 }, slow: 20 },
  { name: "breaker", knobs: { circuitBreaker: true }, slow: 20 },
  { name: "bulkhead=2", knobs: { bulkhead: 2 }, slow: 20 },
  { name: "short timeout + retries", knobs: { timeoutMs: 200, retries: 2 }, slow: 20 },
];

const run = (knobs: Partial<Knobs>, slow: number, seed = 1): SimulationResult =>
  simulate({ seed, knobs: { ...DEFAULT_KNOBS, ...knobs }, paymentSlowdown: slow, recordEvents: true });

describe("engine invariants", () => {
  for (const c of CONFIGS) {
    test(`${c.name}: every request is in exactly one outcome state`, () => {
      const r = run(c.knobs, c.slow);
      expect(r.succeeded + r.degraded + r.failed + r.outstanding).toBe(r.offered);
      expect(Object.values(r.failuresByCode).reduce((a, b) => a + b, 0)).toBe(r.failed);
      expect(r.status).toBe("complete");
    });

    test(`${c.name}: occupancy and queues respect capacity`, () => {
      const r = run(c.knobs, c.slow);
      for (const id of NODE_IDS) {
        expect(r.nodes[id].occupiedSlotFraction).toBeLessThanOrEqual(1);
        expect(r.nodes[id].peakQueue).toBeLessThanOrEqual(NODES[id].queueCapacity);
      }
    });

    test(`${c.name}: event times never decrease and none follow the cutoff`, () => {
      const events = run(c.knobs, c.slow).events ?? [];
      expect(events.length).toBeGreaterThan(0);
      for (let i = 1; i < events.length; i++) expect(events[i].t).toBeGreaterThanOrEqual(events[i - 1].t);
      expect(events[events.length - 1].t).toBeLessThanOrEqual(HORIZON_MS);
    });
  }

  test("queues are FIFO at every node", () => {
    for (const c of CONFIGS) {
      const events = run(c.knobs, c.slow).events ?? [];
      for (const node of NODE_IDS) {
        const queued = events.filter((e) => e.node === node && e.type === "queued").map((e) => e.visitId);
        const queuedSet = new Set(queued);
        const startedFromQueue = events
          .filter((e) => e.node === node && e.type === "start" && queuedSet.has(e.visitId))
          .map((e) => e.visitId);
        expect(startedFromQueue).toEqual(queued.slice(0, startedFromQueue.length));
      }
    }
  });

  test("same seed and inputs give identical results and hashes, including events", () => {
    expect(run({ retries: 3 }, 20, 42)).toEqual(run({ retries: 3 }, 20, 42));
    expect(run({}, 20, 1).runHash).toBe(run({}, 20, 1).runHash);
    expect(run({}, 20, 1).runHash).not.toBe(run({ retries: 1 }, 20, 1).runHash);
  });

  test("the seed only changes the cache-miss pattern, not whether the baseline passes", () => {
    for (const seed of [1, 2, 3]) expect(run({}, 1, seed).errorRate).toBe(0);
  });

  test("circuit breaker does not trigger on the healthy baseline", () => {
    const r = run({ circuitBreaker: true }, 1);
    expect(r.degraded).toBe(0);
    expect(r.errorRate).toBe(0);
  });

  test("bulkhead rejects excess Payment attempts immediately", () => {
    const r = run({ bulkhead: 2 }, 20);
    expect(r.failuresByCode.BULKHEAD_FULL).toBeGreaterThan(0);
  });
});

describe("input validation", () => {
  const bad = (knobs: Partial<Knobs>, slow = 1) => () =>
    simulate({ seed: 1, knobs: { ...DEFAULT_KNOBS, ...knobs }, paymentSlowdown: slow });

  test("out-of-domain knobs are rejected with INVALID_KNOBS", () => {
    for (const knobs of [
      { timeoutMs: 10 },
      { timeoutMs: 100.5 },
      { retries: -1 },
      { retries: 6 },
      { bulkhead: 0 },
      { bulkhead: 21 },
    ]) {
      expect(bad(knobs)).toThrow(EngineError);
      try {
        bad(knobs)();
      } catch (e) {
        expect((e as EngineError).code).toBe("INVALID_KNOBS");
      }
    }
  });

  test("unsupported slowdown is rejected with INVALID_FAULT", () => {
    try {
      bad({}, 5)();
      expect.unreachable();
    } catch (e) {
      expect((e as EngineError).code).toBe("INVALID_FAULT");
    }
  });
});
