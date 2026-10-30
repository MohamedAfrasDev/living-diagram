import { describe, expect, test } from "vitest";
import { DEFAULT_SCENARIO, NODE_IDS, arrivalCount, HORIZON_MS, type Scenario } from "./scenario";
import { EngineError, simulate, type Knobs, type SimulationResult } from "./simulate";

const D: Knobs = { timeoutMs: 1000, retries: 0, circuitBreaker: false, bulkhead: null };
const make = (patch: (s: { nodes: Record<string, { concurrency: number; queueCapacity: number; localMs: number }>; arrivalIntervalMs: number; cacheMissRate: number; faultFactor: number }) => void): Scenario => {
  const s = structuredClone(DEFAULT_SCENARIO) as unknown as Parameters<typeof patch>[0];
  patch(s);
  return s as unknown as Scenario;
};
// `slow` is 1 (healthy), "fault" (the scenario's own fault factor), or an explicit number.
const run = (scenario: Scenario, knobs: Partial<Knobs> = {}, slow: number | "fault" = "fault", seed = 1, extra: { recordEvents?: boolean; recordTimeline?: boolean } = {}): SimulationResult =>
  simulate({ seed, knobs: { ...D, ...knobs }, paymentSlowdown: slow === "fault" ? scenario.faultFactor : slow, scenario, ...extra });

const bigPayment = make((s) => void (s.nodes.payment.concurrency = 20));
const lowLoad = make((s) => void (s.arrivalIntervalMs = 40));
const highLoad = make((s) => void (s.arrivalIntervalMs = 10));
const mildFault = make((s) => void (s.faultFactor = 2));
const tiny = make((s) => {
  s.nodes.gateway = { concurrency: 5, queueCapacity: 0, localMs: 3 };
  s.nodes.order = { concurrency: 4, queueCapacity: 2, localMs: 7 };
  s.nodes.payment = { concurrency: 2, queueCapacity: 3, localMs: 30 };
  s.nodes.db = { concurrency: 3, queueCapacity: 4, localMs: 12 };
  s.arrivalIntervalMs = 25;
  s.cacheMissRate = 0.5;
  s.faultFactor = 10;
});
const wide = make((s) => {
  s.nodes.order = { concurrency: 300, queueCapacity: 300, localMs: 2 };
  s.nodes.payment = { concurrency: 100, queueCapacity: 100, localMs: 40 };
  s.nodes.db = { concurrency: 200, queueCapacity: 0, localMs: 5 };
  s.arrivalIntervalMs = 15;
  s.cacheMissRate = 0;
  s.faultFactor = 50;
});

describe("a custom scenario changes the run", () => {
  test("the offered count follows the interval", () => {
    expect(run(lowLoad, {}, 1).offered).toBe(250);
    expect(run(highLoad, {}, 1).offered).toBe(1000);
    expect(run(tiny, {}, 1).offered).toBe(arrivalCount(tiny));
  });

  test("a non-default scenario changes the hash; the same scenario is deterministic", () => {
    const base = run(DEFAULT_SCENARIO);
    const a = run(bigPayment);
    expect(a.runHash).not.toBe(base.runHash);
    expect(run(bigPayment).runHash).toBe(a.runHash);
    expect(run(bigPayment, {}, 20, 2).runHash).not.toBe(a.runHash);
  });

  test("the scenario is part of the hashed input: different scenarios never share a hash", () => {
    const hashes = new Set([run(DEFAULT_SCENARIO), run(bigPayment), run(lowLoad), run(highLoad), run(mildFault), run(tiny), run(wide)].map((r) => r.runHash));
    expect(hashes.size).toBe(7);
  });
});

describe("paymentSlowdown must be 1 or the scenario's fault factor", () => {
  test("the default still accepts only 1 and 20", () => {
    expect(() => run(DEFAULT_SCENARIO, {}, 1)).not.toThrow();
    expect(() => run(DEFAULT_SCENARIO, {}, 20)).not.toThrow();
    for (const bad of [2, 10, 19, 50]) expect(() => run(DEFAULT_SCENARIO, {}, bad)).toThrow(EngineError);
  });

  test("a custom factor is accepted and 20 is then rejected", () => {
    expect(() => run(tiny, {}, 10)).not.toThrow();
    expect(() => run(tiny, {}, 1)).not.toThrow();
    try {
      run(tiny, {}, 20);
      expect.unreachable();
    } catch (e) {
      expect((e as EngineError).code).toBe("INVALID_FAULT");
    }
  });

  test("an invalid scenario is rejected with INVALID_SCENARIO", () => {
    const bad = make((s) => void (s.nodes.payment.concurrency = 0));
    try {
      run(bad, {}, 1);
      expect.unreachable();
    } catch (e) {
      expect((e as EngineError).code).toBe("INVALID_SCENARIO");
      expect((e as EngineError).message).toContain("nodes.payment.concurrency");
    }
  });
});

describe("G5: behavior moves the way the numbers say", () => {
  test("more Payment workers strictly lower the fault-alone error rate", () => {
    expect(run(bigPayment).errorRate).toBeLessThan(run(DEFAULT_SCENARIO).errorRate);
  });

  test("a lower request rate never raises it, a higher one never lowers it", () => {
    const base = run(DEFAULT_SCENARIO).errorRate;
    expect(run(lowLoad).errorRate).toBeLessThanOrEqual(base);
    expect(run(highLoad).errorRate).toBeGreaterThanOrEqual(base);
  });

  test("a milder fault strictly lowers it", () => {
    expect(run(mildFault).errorRate).toBeLessThan(run(DEFAULT_SCENARIO).errorRate);
  });

  test("a healthy run is the same whatever the fault factor is", () => {
    const a = run(make((s) => void (s.faultFactor = 5)), {}, 1);
    const b = run(make((s) => void (s.faultFactor = 40)), {}, 1);
    const { runHash: _a, ...restA } = a;
    const { runHash: _b, ...restB } = b;
    void _a;
    void _b;
    expect(restA).toEqual(restB);
  });

  test("a cache that always misses loads the database more than one that never does", () => {
    const never = run(make((s) => void (s.cacheMissRate = 0)), {}, 1);
    const always = run(make((s) => void (s.cacheMissRate = 1)), {}, 1);
    expect(always.nodes.db.occupiedSlotFraction).toBeGreaterThan(never.nodes.db.occupiedSlotFraction);
  });

  test("a slower Payment base time raises healthy latency by that amount", () => {
    const base = run(DEFAULT_SCENARIO, {}, 1).latencyMs.p50 ?? 0;
    const slower = run(make((s) => void (s.nodes.payment.localMs = 120)), {}, 1).latencyMs.p50 ?? 0;
    expect(slower).toBeGreaterThanOrEqual(base + 100);
  });
});

describe("G4: invariants hold on custom scenarios", () => {
  const scenarios: [string, Scenario][] = [["tiny", tiny], ["wide", wide], ["highLoad", highLoad]];
  const configs: [string, Partial<Knobs>, 1 | 20][] = [["healthy", {}, 1], ["fault", {}, 20], ["retries", { retries: 3 }, 20], ["breaker", { circuitBreaker: true }, 20], ["bulkhead", { bulkhead: 2 }, 20]];

  for (const [sName, scenario] of scenarios) {
    for (const [cName, knobs, slowRaw] of configs) {
      const slow = slowRaw === 20 ? scenario.faultFactor : 1;
      test(`${sName} / ${cName}: one outcome per request, capacities respected, events ordered`, () => {
        const r = run(scenario, knobs, slow, 1, { recordEvents: true, recordTimeline: true });
        expect(r.succeeded + r.degraded + r.failed + r.outstanding).toBe(r.offered);
        expect(Object.values(r.failuresByCode).reduce((a, b) => a + b, 0)).toBe(r.failed);
        for (const id of NODE_IDS) {
          const spec = scenario.nodes[id];
          expect(r.nodes[id].occupiedSlotFraction).toBeLessThanOrEqual(1);
          expect(r.nodes[id].peakQueue).toBeLessThanOrEqual(spec.queueCapacity);
          for (const s of r.timeline ?? []) {
            expect(s.nodes[id].busy).toBeLessThanOrEqual(spec.concurrency);
            expect(s.nodes[id].queue).toBeLessThanOrEqual(spec.queueCapacity);
          }
        }
        const events = r.events ?? [];
        for (let i = 1; i < events.length; i++) expect(events[i].t).toBeGreaterThanOrEqual(events[i - 1].t);
        expect(events.at(-1)?.t ?? 0).toBeLessThanOrEqual(HORIZON_MS);
      });
    }
  }

  test("queues are FIFO on a custom scenario", () => {
    const events = run(tiny, { retries: 2 }, tiny.faultFactor, 1, { recordEvents: true }).events ?? [];
    for (const node of NODE_IDS) {
      const queued = events.filter((e) => e.node === node && e.type === "queued").map((e) => e.visitId);
      const set = new Set(queued);
      const started = events.filter((e) => e.node === node && e.type === "start" && set.has(e.visitId)).map((e) => e.visitId);
      expect(started).toEqual(queued.slice(0, started.length));
    }
  });

  test("an oversized run is reported incomplete or complete, never thrown or ranked", () => {
    const heavy = make((s) => {
      s.arrivalIntervalMs = 10;
      s.nodes.payment.concurrency = 500;
      s.nodes.payment.queueCapacity = 500;
    });
    const r = run(heavy, { retries: 5, timeoutMs: 50 }, heavy.faultFactor);
    expect(["complete", "incomplete"]).toContain(r.status);
    expect(r.succeeded + r.degraded + r.failed + r.outstanding).toBe(r.offered);
  });
});
