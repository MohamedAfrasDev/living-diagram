import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { DEFAULT_SCENARIO, arrivalCount, isDefaultScenario, validateScenario, type Scenario } from "./scenario";
import { simulate, type Knobs } from "./simulate";

type Row = { seed: number; paymentSlowdown: 1 | 20; knobs: Knobs; runHash: string; offered: number; errorRate: number; degradedRate: number };
const fixture = JSON.parse(readFileSync("lib/engine/default-results.fixture.json", "utf-8")) as Row[];

const clone = (): Scenario => structuredClone(DEFAULT_SCENARIO) as Scenario;

describe("G1: the default scenario reproduces today's results bit for bit", () => {
  test("the fixture was captured from the engine before the refactor", () => {
    expect(fixture.length).toBe(72);
    const fault1 = fixture.find((r) => r.seed === 1 && r.paymentSlowdown === 20 && r.knobs.retries === 0 && !r.knobs.circuitBreaker && r.knobs.bulkhead === null && r.knobs.timeoutMs === 1000);
    const fault2 = fixture.find((r) => r.seed === 2 && r.paymentSlowdown === 20 && r.knobs.retries === 0 && !r.knobs.circuitBreaker && r.knobs.bulkhead === null && r.knobs.timeoutMs === 1000);
    expect(fault1?.runHash).toBe("0ff17241");
    expect(fault2?.runHash).toBe("85f1abac");
  });

  test("every fixture row is reproduced with no scenario argument", () => {
    for (const r of fixture) {
      const out = simulate({ seed: r.seed, knobs: r.knobs, paymentSlowdown: r.paymentSlowdown });
      expect(out.runHash, JSON.stringify(r.knobs) + r.seed).toBe(r.runHash);
      expect(out.offered).toBe(r.offered);
    }
  });

  test("every fixture row is reproduced with DEFAULT_SCENARIO passed explicitly", () => {
    for (const r of fixture) {
      const out = simulate({ seed: r.seed, knobs: r.knobs, paymentSlowdown: r.paymentSlowdown, scenario: DEFAULT_SCENARIO });
      expect(out.runHash, JSON.stringify(r.knobs) + r.seed).toBe(r.runHash);
      expect(out.errorRate).toBe(r.errorRate);
      expect(out.degradedRate).toBe(r.degradedRate);
    }
  });

  test("a structurally equal copy is the default, anything else is not", () => {
    expect(isDefaultScenario(clone())).toBe(true);
    const changed = clone();
    changed.nodes.payment.concurrency = 11;
    expect(isDefaultScenario(changed)).toBe(false);
    for (const r of fixture.slice(0, 6)) {
      expect(simulate({ seed: r.seed, knobs: r.knobs, paymentSlowdown: r.paymentSlowdown, scenario: clone() }).runHash).toBe(r.runHash);
    }
  });
});

describe("the default scenario", () => {
  test("holds the numbers in docs/04-scenario-pack.md", () => {
    expect(DEFAULT_SCENARIO.nodes.gateway).toEqual({ concurrency: 100, queueCapacity: 100, localMs: 2 });
    expect(DEFAULT_SCENARIO.nodes.order).toEqual({ concurrency: 50, queueCapacity: 40, localMs: 5 });
    expect(DEFAULT_SCENARIO.nodes.cache).toEqual({ concurrency: 50, queueCapacity: 0, localMs: 1 });
    expect(DEFAULT_SCENARIO.nodes.payment).toEqual({ concurrency: 10, queueCapacity: 20, localMs: 20 });
    expect(DEFAULT_SCENARIO.nodes.db).toEqual({ concurrency: 20, queueCapacity: 40, localMs: 10 });
    expect(DEFAULT_SCENARIO.arrivalIntervalMs).toBe(20);
    expect(DEFAULT_SCENARIO.cacheMissRate).toBe(0.25);
    expect(DEFAULT_SCENARIO.faultFactor).toBe(20);
    expect(arrivalCount(DEFAULT_SCENARIO)).toBe(500);
  });

  test("is not mutable by accident", () => {
    expect(Object.isFrozen(DEFAULT_SCENARIO)).toBe(true);
    expect(Object.isFrozen(DEFAULT_SCENARIO.nodes.payment)).toBe(true);
  });

  test("the offered count follows the interval over the fixed 10 s window", () => {
    for (const [interval, count] of [[10, 1000], [20, 500], [25, 400], [40, 250], [200, 50], [30, 333]] as const) {
      expect(arrivalCount({ ...clone(), arrivalIntervalMs: interval })).toBe(count);
    }
  });
});

describe("G3: validation rejects just outside the bounds and accepts the edges", () => {
  const nodeIds = ["gateway", "order", "cache", "payment", "db"] as const;
  const withNode = (id: (typeof nodeIds)[number], field: "concurrency" | "queueCapacity" | "localMs", value: unknown) => {
    const s = clone() as unknown as { nodes: Record<string, Record<string, unknown>> };
    s.nodes[id][field] = value;
    return s;
  };

  test("accepts the default and returns the scenario", () => {
    const r = validateScenario(clone());
    expect(r.ok).toBe(true);
  });

  test("node fields: concurrency 1 to 500, queue 0 to 500, localMs 1 to 2000, integers only", () => {
    const bounds = { concurrency: [1, 500], queueCapacity: [0, 500], localMs: [1, 2000] } as const;
    for (const id of nodeIds) {
      for (const [field, [lo, hi]] of Object.entries(bounds) as ["concurrency" | "queueCapacity" | "localMs", readonly [number, number]][]) {
        expect(validateScenario(withNode(id, field, lo)).ok, `${id}.${field}=${lo}`).toBe(true);
        expect(validateScenario(withNode(id, field, hi)).ok, `${id}.${field}=${hi}`).toBe(true);
        for (const bad of [lo - 1, hi + 1, 2.5, NaN, Infinity, "10", null]) {
          const r = validateScenario(withNode(id, field, bad));
          expect(r.ok, `${id}.${field}=${String(bad)}`).toBe(false);
          if (!r.ok) expect(r.field).toBe(`nodes.${id}.${field}`);
        }
      }
    }
  });

  test("global fields: interval 10 to 200, miss rate 0 to 1 in steps of 0.01, fault factor 2 to 50", () => {
    const set = (k: string, v: unknown) => ({ ...clone(), [k]: v });
    for (const ok of [10, 200, 33]) expect(validateScenario(set("arrivalIntervalMs", ok)).ok).toBe(true);
    for (const bad of [9, 201, 20.5, "20"]) {
      const r = validateScenario(set("arrivalIntervalMs", bad));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.field).toBe("arrivalIntervalMs");
    }
    for (const ok of [0, 1, 0.25, 0.01, 0.99]) expect(validateScenario(set("cacheMissRate", ok)).ok, String(ok)).toBe(true);
    for (const bad of [-0.01, 1.01, 0.255, NaN, "0.25"]) {
      const r = validateScenario(set("cacheMissRate", bad));
      expect(r.ok, String(bad)).toBe(false);
      if (!r.ok) expect(r.field).toBe("cacheMissRate");
    }
    for (const ok of [2, 50, 20]) expect(validateScenario(set("faultFactor", ok)).ok).toBe(true);
    for (const bad of [1, 51, 0, 2.5]) {
      const r = validateScenario(set("faultFactor", bad));
      expect(r.ok, String(bad)).toBe(false);
      if (!r.ok) expect(r.field).toBe("faultFactor");
    }
  });

  test("rejects non-objects, missing services, unknown services and unknown fields", () => {
    for (const bad of [null, undefined, "x", 5, [], {}]) expect(validateScenario(bad).ok).toBe(false);
    const missing = clone() as unknown as { nodes: Record<string, unknown> };
    delete missing.nodes.payment;
    const r1 = validateScenario(missing);
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.field).toBe("nodes.payment");
    const extraNode = clone() as unknown as { nodes: Record<string, unknown> };
    extraNode.nodes.queue = { concurrency: 1, queueCapacity: 1, localMs: 1 };
    const r2 = validateScenario(extraNode);
    expect(r2.ok).toBe(false);
    const extraField = { ...clone(), replicas: 3 };
    expect(validateScenario(extraField).ok).toBe(false);
    const extraNodeField = withNode("order", "concurrency", 5) as unknown as { nodes: { order: Record<string, unknown> } };
    extraNodeField.nodes.order.cpu = 4;
    expect(validateScenario(extraNodeField).ok).toBe(false);
  });

  test("never clamps: an out-of-range value is an error, not a corrected value", () => {
    const r = validateScenario(withNode("payment", "concurrency", 1000));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/1.*500/);
  });
});
