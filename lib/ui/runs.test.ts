import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import type { GoldenRun } from "../agent/replay";
import { simulate } from "../engine/simulate";
import { fmtCount, fmtMs, fmtRate, headlineRows } from "./format";
import { DEFAULT_SCENARIO, type Scenario } from "../engine/scenario";
import { DEFAULT_KNOBS, describeKnobs, extractRuns, runInput, sameNumbers, sampleAt } from "./runs";

const golden = JSON.parse(readFileSync("public/golden/slow-payment-run-1.json", "utf-8")) as GoldenRun;

describe("extractRuns", () => {
  test("recovers every simulate run from a transcript with its inputs", () => {
    const runs = extractRuns(golden.entries);
    expect(runs.length).toBe(golden.outcome.usage.simulations);
    expect(runs.map((r) => r.id)).toEqual(runs.map((_, i) => `run-${i + 1}`));
    expect(runs.every((r) => r.source === "agent")).toBe(true);
    // The inputs are exactly what the agent sent, so re-running reproduces the recorded metrics.
    const firstResult = golden.entries.find((e) => e.kind === "tool_result" && e.name === "simulate");
    if (firstResult?.kind !== "tool_result" || !firstResult.result.ok) throw new Error("no simulate result");
    const recorded = (firstResult.result.data as { runHash: string }).runHash;
    expect(simulate(runInput(runs[0])).runHash).toBe(recorded);
  });

  test("ignores calls that failed or have no result yet (a live stream in progress)", () => {
    const partial = golden.entries.slice(0, 1);
    expect(extractRuns(partial)).toEqual([]);
    const callOnly = golden.entries.filter((e, i) => i < 2 || e.kind !== "tool_result").slice(0, 3);
    expect(extractRuns(callOnly)).toEqual([]);
    expect(
      extractRuns([
        { kind: "tool_call", callId: "c1", name: "simulate", args: { knobs: DEFAULT_KNOBS, paymentSlowdown: 5, seed: 1 } },
        { kind: "tool_result", callId: "c1", name: "simulate", result: { ok: false, error: { code: "INVALID_FAULT", message: "x" } } },
      ]),
    ).toEqual([]);
  });
});

describe("describeKnobs", () => {
  test("says defaults, or lists only what differs", () => {
    expect(describeKnobs(DEFAULT_KNOBS)).toBe("defaults");
    expect(describeKnobs({ ...DEFAULT_KNOBS, circuitBreaker: true })).toBe("breaker on");
    expect(describeKnobs({ timeoutMs: 300, retries: 3, circuitBreaker: false, bulkhead: 5 })).toBe("timeout 300 ms, retries 3, bulkhead 5");
  });
});

describe("sampleAt", () => {
  const timeline = simulate({ seed: 1, knobs: DEFAULT_KNOBS, paymentSlowdown: 20, recordTimeline: true }).timeline ?? [];
  test("snaps to the sample at or before t and clamps to the ends", () => {
    expect(sampleAt(timeline, 0).t).toBe(0);
    expect(sampleAt(timeline, 74).t).toBe(50);
    expect(sampleAt(timeline, 75).t).toBe(50);
    expect(sampleAt(timeline, 100).t).toBe(100);
    expect(sampleAt(timeline, -10).t).toBe(0);
    expect(sampleAt(timeline, 99_999).t).toBe(15_000);
  });
});

describe("format", () => {
  test("rates are percentages with one decimal, counts are integers, ms have a unit", () => {
    expect(fmtRate(0.94)).toBe("94.0%");
    expect(fmtRate(0.008)).toBe("0.8%");
    expect(fmtCount(328)).toBe("328");
    expect(fmtMs(2968)).toBe("2,968 ms");
    expect(fmtMs(null)).toBe("n/a");
  });

  test("the headline rows always show degraded next to errorRate (D-005)", () => {
    const rows = headlineRows(simulate({ seed: 1, knobs: DEFAULT_KNOBS, paymentSlowdown: 20 }));
    const keys = rows.map((r) => r.key);
    expect(keys.indexOf("degradedRate")).toBe(keys.indexOf("errorRate") + 1);
    expect(rows.find((r) => r.key === "errorRate")?.value).toBeGreaterThan(0.2);
  });
});

describe("runs carry the numbers they were run on", () => {
  const custom = (() => {
    const c = structuredClone(DEFAULT_SCENARIO) as unknown as { nodes: { payment: { concurrency: number } } };
    c.nodes.payment.concurrency = 14;
    return c as unknown as Scenario;
  })();

  test("transcript runs default to the template numbers", () => {
    for (const r of extractRuns(golden.entries)) expect(r.scenario).toEqual(DEFAULT_SCENARIO);
  });

  test("a transcript read with another scenario binds every run to it", () => {
    // The recorded calls use fault factor 20, which this scenario keeps.
    const runs = extractRuns(golden.entries, custom);
    expect(runs.length).toBe(golden.outcome.usage.simulations);
    for (const r of runs) expect(r.scenario.nodes.payment.concurrency).toBe(14);
  });

  test("runInput includes the scenario, so re-running reproduces the run", () => {
    const [first] = extractRuns(golden.entries, custom);
    const input = runInput(first);
    expect(input.scenario?.nodes.payment.concurrency).toBe(14);
    expect(simulate(input).runHash).not.toBe(simulate(runInput(extractRuns(golden.entries)[0])).runHash);
  });

  test("only runs on the same numbers are comparable", () => {
    const a = extractRuns(golden.entries)[0];
    const b = extractRuns(golden.entries)[1];
    const c = extractRuns(golden.entries, custom)[0];
    expect(sameNumbers(a, b)).toBe(true);
    expect(sameNumbers(a, c)).toBe(false);
    expect(sameNumbers({ ...a, scenario: structuredClone(a.scenario) as Scenario }, a)).toBe(true);
  });
});
