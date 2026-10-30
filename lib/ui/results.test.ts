import { describe, expect, test } from "vitest";
import { DEFAULT_SCENARIO, type Scenario } from "../engine/scenario";
import { simulate } from "../engine/simulate";
import { runCacheKey, resultFor } from "./results";
import { DEFAULT_KNOBS, runInput, type UiRun } from "./runs";

const withPayment = (workers: number): Scenario => {
  const s = structuredClone(DEFAULT_SCENARIO) as unknown as { nodes: { payment: { concurrency: number } } };
  s.nodes.payment.concurrency = workers;
  return s as unknown as Scenario;
};
const run = (scenario: Scenario, id = "r", seed = 1, knobs = DEFAULT_KNOBS, slow = 20): UiRun => ({ id, source: "manual", knobs, paymentSlowdown: slow, seed, scenario });

describe("the result cache key includes the numbers a run was made on", () => {
  test("runs that differ only in their numbers have different keys", () => {
    expect(runCacheKey(run(DEFAULT_SCENARIO))).not.toBe(runCacheKey(run(withPayment(20))));
  });

  test("identical runs share a key, whatever their id or the key order of their numbers", () => {
    expect(runCacheKey(run(DEFAULT_SCENARIO, "a"))).toBe(runCacheKey(run(DEFAULT_SCENARIO, "b")));
    const reordered = JSON.parse(JSON.stringify({ faultFactor: 20, cacheMissRate: 0.25, arrivalIntervalMs: 20, nodes: DEFAULT_SCENARIO.nodes })) as Scenario;
    expect(runCacheKey(run(reordered))).toBe(runCacheKey(run(DEFAULT_SCENARIO)));
  });

  test("seed, settings and fault still distinguish runs", () => {
    const base = runCacheKey(run(DEFAULT_SCENARIO));
    expect(runCacheKey(run(DEFAULT_SCENARIO, "r", 2))).not.toBe(base);
    expect(runCacheKey(run(DEFAULT_SCENARIO, "r", 1, { ...DEFAULT_KNOBS, retries: 2 }))).not.toBe(base);
    expect(runCacheKey(run(DEFAULT_SCENARIO, "r", 1, DEFAULT_KNOBS, 1))).not.toBe(base);
  });
});

describe("resultFor never shows one set of numbers' results for another", () => {
  test("a custom run gets its own result, whichever was computed first", () => {
    const custom = run(withPayment(20));
    const template = run(DEFAULT_SCENARIO);
    const a = resultFor(template);
    const b = resultFor(custom);
    expect(b.runHash).toBe(simulate(runInput(custom, true)).runHash);
    expect(a.runHash).toBe(simulate(runInput(template, true)).runHash);
    expect(b.runHash).not.toBe(a.runHash);
    // The point of the numbers: twice the Payment workers changes the outcome a lot.
    expect(b.errorRate).toBeLessThan(a.errorRate);
  });

  test("the same holds in the opposite order", () => {
    const custom = run(withPayment(15), "c", 2);
    const template = run(DEFAULT_SCENARIO, "t", 2);
    const b = resultFor(custom);
    const a = resultFor(template);
    expect(a.runHash).toBe(simulate(runInput(template, true)).runHash);
    expect(b.runHash).toBe(simulate(runInput(custom, true)).runHash);
    expect(a.runHash).not.toBe(b.runHash);
  });

  test("results are cached, carry the canvas timeline, and the default still matches the recorded fixture", () => {
    const r = run(DEFAULT_SCENARIO, "x", 1);
    const first = resultFor(r);
    expect(resultFor({ ...r, id: "y" })).toBe(first);
    expect(first.timeline?.length).toBeGreaterThan(0);
    expect(first.runHash).toBe("0ff17241");
  });
});
