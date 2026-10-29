import { describe, expect, test } from "vitest";
import { HORIZON_MS, NODE_IDS, NODES } from "./scenario";
import { simulate, type Knobs, type SimulationResult } from "./simulate";

const DEFAULT: Knobs = { timeoutMs: 1000, retries: 0, circuitBreaker: false, bulkhead: null };
const run = (knobs: Partial<Knobs>, slow: number, timeline: boolean, seed = 1): SimulationResult =>
  simulate({ seed, knobs: { ...DEFAULT, ...knobs }, paymentSlowdown: slow, recordTimeline: timeline });

describe("occupancy timeline (for the canvas)", () => {
  test("is sampled every 50 ms from 0 to the cutoff, only when asked for", () => {
    expect(run({}, 20, false).timeline).toBeUndefined();
    const t = run({}, 20, true).timeline ?? [];
    expect(t.length).toBe(HORIZON_MS / 50 + 1);
    expect(t[0].t).toBe(0);
    expect(t[t.length - 1].t).toBe(HORIZON_MS);
    for (let i = 1; i < t.length; i++) expect(t[i].t - t[i - 1].t).toBe(50);
  });

  test("does not change the result or its hash", () => {
    for (const [knobs, slow] of [[{}, 1], [{}, 20], [{ retries: 3 }, 20], [{ circuitBreaker: true }, 20]] as const) {
      const without = run(knobs, slow, false);
      const { timeline, ...withRest } = run(knobs, slow, true);
      expect(timeline?.length).toBeGreaterThan(0);
      expect(withRest).toEqual(without);
    }
  });

  test("samples respect capacities and cumulative outcomes never decrease", () => {
    const t = run({ retries: 3 }, 20, true).timeline ?? [];
    for (const s of t) {
      for (const id of NODE_IDS) {
        expect(s.nodes[id].busy).toBeLessThanOrEqual(NODES[id].concurrency);
        expect(s.nodes[id].queue).toBeLessThanOrEqual(NODES[id].queueCapacity);
        expect(s.nodes[id].busy).toBeGreaterThanOrEqual(0);
      }
    }
    for (let i = 1; i < t.length; i++) {
      expect(t[i].outcomes.succeeded).toBeGreaterThanOrEqual(t[i - 1].outcomes.succeeded);
      expect(t[i].outcomes.degraded).toBeGreaterThanOrEqual(t[i - 1].outcomes.degraded);
      expect(t[i].outcomes.failed).toBeGreaterThanOrEqual(t[i - 1].outcomes.failed);
    }
  });

  test("the last sample agrees with the final counts, and sampled queues never exceed the recorded peak", () => {
    const r = run({}, 20, true);
    const last = r.timeline?.at(-1);
    expect(last?.outcomes).toEqual({ succeeded: r.succeeded, degraded: r.degraded, failed: r.failed });
    for (const id of NODE_IDS) {
      const maxQueue = Math.max(...(r.timeline ?? []).map((s) => s.nodes[id].queue));
      expect(maxQueue).toBeLessThanOrEqual(r.nodes[id].peakQueue);
    }
  });

  test("shows the fault: Payment saturates under the fault but not when healthy", () => {
    const healthy = run({}, 1, true).timeline ?? [];
    const faulty = run({}, 20, true).timeline ?? [];
    const peak = (t: typeof healthy) => Math.max(...t.map((s) => s.nodes.payment.busy));
    expect(peak(healthy)).toBeLessThan(NODES.payment.concurrency);
    expect(peak(faulty)).toBe(NODES.payment.concurrency);
  });

  test("the breaker state is only ever non-closed when the breaker is on", () => {
    const off = run({}, 20, true).timeline ?? [];
    expect(off.every((s) => s.breaker === "closed")).toBe(true);
    const on = run({ circuitBreaker: true }, 20, true).timeline ?? [];
    expect(on.some((s) => s.breaker === "open")).toBe(true);
  });
});
