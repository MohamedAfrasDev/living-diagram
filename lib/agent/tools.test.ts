import { describe, expect, test } from "vitest";
import { simulate } from "../engine/simulate";
import { TOOL_DEFINITIONS, TOOL_NAMES } from "../contracts/tools";
import { ToolSession } from "./tools";

const BASE_KNOBS = { timeoutMs: 1000, retries: 0, circuitBreaker: false, bulkhead: null };
const sim = (session: ToolSession, knobs: object = {}, slow = 20, seed = 1) =>
  session.call("simulate", { knobs: { ...BASE_KNOBS, ...knobs }, paymentSlowdown: slow, seed });

function dataOf(result: ReturnType<ToolSession["call"]>) {
  if (!result.ok) throw new Error(`expected ok, got ${result.error.code}: ${result.error.message}`);
  return result.data as Record<string, unknown>;
}

describe("tool layer: rejection, not guessing", () => {
  test("unknown tool name is rejected", () => {
    const r = new ToolSession().call("delete_everything", {});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("UNKNOWN_TOOL");
  });

  test("unknown argument field is rejected, not ignored", () => {
    const r = new ToolSession().call("simulate", { knobs: BASE_KNOBS, paymentSlowdown: 20, seed: 1, speed: 9 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("UNKNOWN_FIELD");
  });

  test("unknown knob field is rejected", () => {
    const r = new ToolSession().call("simulate", { knobs: { ...BASE_KNOBS, replicas: 3 }, paymentSlowdown: 20, seed: 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("UNKNOWN_FIELD");
  });

  test("missing or mistyped arguments are INVALID_ARGS", () => {
    const s = new ToolSession();
    for (const args of [null, "x", {}, { knobs: BASE_KNOBS, paymentSlowdown: 20 }, { knobs: BASE_KNOBS, paymentSlowdown: 20, seed: "1" }]) {
      const r = s.call("simulate", args);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(["INVALID_ARGS", "UNKNOWN_FIELD"]).toContain(r.error.code);
    }
  });

  test("out-of-domain knobs are INVALID_KNOBS and bad slowdown is INVALID_FAULT", () => {
    const s = new ToolSession();
    const bad = s.call("simulate", { knobs: { ...BASE_KNOBS, retries: 9 }, paymentSlowdown: 20, seed: 1 });
    expect(bad.ok === false && bad.error.code).toBe("INVALID_KNOBS");
    const fault = s.call("simulate", { knobs: BASE_KNOBS, paymentSlowdown: 5, seed: 1 });
    expect(fault.ok === false && fault.error.code).toBe("INVALID_FAULT");
  });
});

describe("simulate and get_metrics: only recorded engine output", () => {
  test("simulate matches a direct engine run and returns no event stream", () => {
    const s = new ToolSession();
    const data = dataOf(sim(s, { retries: 3 }));
    const direct = simulate({ seed: 1, knobs: { ...BASE_KNOBS, retries: 3 }, paymentSlowdown: 20 });
    expect(data.runId).toBe("run-1");
    expect(data.runHash).toBe(direct.runHash);
    const metrics = data.metrics as Record<string, number | null>;
    expect(metrics.errorRate).toBe(direct.errorRate);
    expect(metrics.paymentAttemptsPerRequest).toBe(direct.paymentAttemptsPerRequest);
    const text = JSON.stringify(data);
    expect(text).not.toContain("events");
    expect(text).not.toContain("visitId");
  });

  test("run ids are sequential and the same calls give the same hashes", () => {
    const a = new ToolSession();
    const b = new ToolSession();
    expect(dataOf(sim(a)).runId).toBe("run-1");
    expect(dataOf(sim(a, { retries: 1 })).runId).toBe("run-2");
    expect(dataOf(sim(b)).runHash).toBe(dataOf(sim(new ToolSession())).runHash);
  });

  test("get_metrics returns requested paths and all paths when empty", () => {
    const s = new ToolSession();
    sim(s);
    const some = dataOf(s.call("get_metrics", { runId: "run-1", paths: ["errorRate", "nodes.order.peakQueue"] }));
    expect(Object.keys(some.values as object).sort()).toEqual(["errorRate", "nodes.order.peakQueue"]);
    const all = dataOf(s.call("get_metrics", { runId: "run-1", paths: [] }));
    expect(Object.keys(all.values as object)).toContain("latencyMs.p95");
    expect(Object.keys(all.values as object)).toContain("nodes.payment.occupiedSlotFraction");
  });

  test("get_metrics rejects unknown run and unknown path", () => {
    const s = new ToolSession();
    sim(s);
    const run = s.call("get_metrics", { runId: "run-9", paths: [] });
    expect(run.ok === false && run.error.code).toBe("UNKNOWN_RUN");
    const path = s.call("get_metrics", { runId: "run-1", paths: ["errorRate", "revenue"] });
    expect(path.ok === false && path.error.code).toBe("UNKNOWN_PATH");
  });
});

describe("get_trace", () => {
  test("returns only the events of the requested logical request, bounded", () => {
    const s = new ToolSession();
    sim(s, { retries: 3 });
    const data = dataOf(s.call("get_trace", { runId: "run-1", requestId: 5 }));
    const events = data.events as { t: number; type: string; node: string }[];
    expect(events.length).toBeGreaterThan(0);
    expect(events.length).toBeLessThanOrEqual(60);
    expect(JSON.stringify(events)).not.toContain("requestId");
    for (let i = 1; i < events.length; i++) expect(events[i].t).toBeGreaterThanOrEqual(events[i - 1].t);
  });

  test("rejects unknown run and out-of-range request ids", () => {
    const s = new ToolSession();
    sim(s);
    expect(s.call("get_trace", { runId: "run-2", requestId: 1 }).ok).toBe(false);
    for (const requestId of [0, 501, 1.5]) {
      const r = s.call("get_trace", { runId: "run-1", requestId });
      expect(r.ok === false && r.error.code).toBe("UNKNOWN_REQUEST");
    }
  });
});

describe("propose_patch", () => {
  test("applies typed operations and reports a diff", () => {
    const s = new ToolSession();
    const data = dataOf(
      s.call("propose_patch", {
        baseKnobs: BASE_KNOBS,
        patch: [
          { field: "circuitBreaker", value: true },
          { field: "retries", value: 0 },
          { field: "bulkhead", value: 4 },
        ],
      }),
    );
    expect(data.candidateKnobs).toEqual({ ...BASE_KNOBS, circuitBreaker: true, bulkhead: 4 });
    expect(data.diff).toEqual([
      { field: "circuitBreaker", from: false, to: true },
      { field: "bulkhead", from: null, to: 4 },
    ]);
  });

  test("rejects unknown fields, bad values and duplicate fields", () => {
    const s = new ToolSession();
    const call = (patch: unknown) => s.call("propose_patch", { baseKnobs: BASE_KNOBS, patch });
    const unknown = call([{ field: "replicas", value: 3 }]);
    expect(unknown.ok === false && unknown.error.code).toBe("UNKNOWN_FIELD");
    const bad = call([{ field: "retries", value: 12 }]);
    expect(bad.ok === false && bad.error.code).toBe("INVALID_KNOBS");
    const dup = call([
      { field: "retries", value: 1 },
      { field: "retries", value: 2 },
    ]);
    expect(dup.ok === false && dup.error.code).toBe("INVALID_ARGS");
    const empty = call([]);
    expect(empty.ok === false && empty.error.code).toBe("INVALID_ARGS");
  });
});

describe("compare", () => {
  test("matched runs give deltas and the knob diff", () => {
    const s = new ToolSession();
    sim(s);
    sim(s, { retries: 3 });
    const data = dataOf(s.call("compare", { runA: "run-1", runB: "run-2" }));
    expect(data.matched).toBe(true);
    expect(data.knobDiff).toEqual([{ field: "retries", from: 0, to: 3 }]);
    const deltas = data.deltas as Record<string, { a: number | null; b: number | null; delta: number | null }>;
    expect(deltas.paymentAttemptsPerRequest.delta).toBeGreaterThan(0);
  });

  test("runs with a different seed or fault are COMPARISON_MISMATCH", () => {
    const s = new ToolSession();
    sim(s, {}, 20, 1);
    sim(s, {}, 20, 2);
    sim(s, {}, 1, 1);
    const seed = s.call("compare", { runA: "run-1", runB: "run-2" });
    expect(seed.ok === false && seed.error.code).toBe("COMPARISON_MISMATCH");
    const fault = s.call("compare", { runA: "run-1", runB: "run-3" });
    expect(fault.ok === false && fault.error.code).toBe("COMPARISON_MISMATCH");
    const unknown = s.call("compare", { runA: "run-1", runB: "run-8" });
    expect(unknown.ok === false && unknown.error.code).toBe("UNKNOWN_RUN");
  });
});

describe("budgets (D-012)", () => {
  test("the 9th simulate call is BUDGET_EXCEEDED", () => {
    const s = new ToolSession();
    for (let i = 0; i < 8; i++) expect(sim(s, {}, 20, i + 1).ok).toBe(true);
    const r = sim(s, {}, 20, 99);
    expect(r.ok === false && r.error.code).toBe("BUDGET_EXCEEDED");
  });

  test("the 25th tool call of any kind is BUDGET_EXCEEDED, rejected calls count", () => {
    const s = new ToolSession();
    for (let i = 0; i < 24; i++) s.call("nope", {});
    const r = s.call("get_metrics", { runId: "run-1", paths: [] });
    expect(r.ok === false && r.error.code).toBe("BUDGET_EXCEEDED");
    expect(s.usage).toEqual({ toolCalls: 24, simulations: 0 });
  });

  test("calls are logged with their results for the activity timeline", () => {
    const s = new ToolSession();
    sim(s);
    s.call("nope", {});
    expect(s.log.map((c) => c.name)).toEqual(["simulate", "nope"]);
    expect(s.log[1].result.ok).toBe(false);
  });
});

describe("tool definitions for the model", () => {
  test("every tool has a strict-shaped flat function definition and matches TOOL_NAMES", () => {
    expect(TOOL_DEFINITIONS.map((t) => t.name).sort()).toEqual([...TOOL_NAMES].sort());
    for (const t of TOOL_DEFINITIONS) {
      expect(t.type).toBe("function");
      expect(t.name).toMatch(/^[a-zA-Z0-9_.-]+$/);
      expect(t.parameters.additionalProperties).toBe(false);
      expect(t.description.length).toBeGreaterThan(10);
    }
  });
});
