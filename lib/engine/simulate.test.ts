import { describe, expect, test } from "vitest";
import { simulate, type Knobs } from "./simulate";

const DEFAULT_KNOBS: Knobs = {
  timeoutMs: 1000,
  retries: 0,
  circuitBreaker: false,
  bulkhead: null,
};

const run = (knobs: Partial<Knobs>, paymentSlowdown: number, seed = 1) =>
  simulate({ seed, knobs: { ...DEFAULT_KNOBS, ...knobs }, paymentSlowdown });

// A scenario "passes" when errorRate <= 5%. A fault "fails" when errorRate > 20%.
const PASS_MAX = 0.05;
const FAIL_MIN = 0.2;

describe("payment-slowdown scenario", () => {
  test("baseline passes", () => {
    const r = run({}, 1);
    expect(r.errorRate).toBeLessThanOrEqual(PASS_MAX);
    expect(r.outstanding).toBe(0);
  });

  test("fault (payment 20x slower) fails: errorRate > 20%", () => {
    const r = run({}, 20);
    expect(r.errorRate).toBeGreaterThan(FAIL_MIN);
  });

  // D-017 (supersedes D-010 for tests 3 and 4): "worse" means more downstream
  // load and a slower tail, not a higher errorRate. D-016 showed retries do not
  // raise errorRate in this scenario, and the tests record that.
  test("bad fix (retries=3) still fails and is worse on load and tail latency", () => {
    for (const seed of [1, 2]) {
      const fault = run({}, 20, seed);
      const bad = run({ retries: 3 }, 20, seed);
      expect(bad.errorRate).toBeGreaterThan(FAIL_MIN);
      expect(bad.paymentAttemptsPerRequest).toBeGreaterThanOrEqual(2 * fault.paymentAttemptsPerRequest);
      expect(bad.latencyMs.p95 ?? 0).toBeGreaterThan(fault.latencyMs.p95 ?? 0);
    }
  });

  test("finding D-016: retries do not raise errorRate in this scenario", () => {
    const fault = run({}, 20);
    const bad = run({ retries: 3 }, 20);
    expect(bad.errorRate).toBeLessThanOrEqual(fault.errorRate);
  });

  test("good fix (circuitBreaker + retries=0) cuts errorRate by at least half and reports degraded", () => {
    for (const seed of [1, 2]) {
      const fault = run({}, 20, seed);
      const good = run({ circuitBreaker: true, retries: 0 }, 20, seed);
      expect(good.errorRate).toBeLessThanOrEqual(0.5 * fault.errorRate);
      expect(good.degraded).toBeGreaterThan(0);
      expect(good.degradedRate).toBeGreaterThan(0);
    }
  });

  test("good fix does not degrade a healthy system", () => {
    const r = run({ circuitBreaker: true, retries: 0 }, 1);
    expect(r.degraded).toBe(0);
    expect(r.errorRate).toBeLessThanOrEqual(PASS_MAX);
  });

  test("same seed gives the same result", () => {
    expect(run({ retries: 3 }, 20, 42)).toEqual(run({ retries: 3 }, 20, 42));
  });
});
