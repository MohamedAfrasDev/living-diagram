import { beforeEach, describe, expect, test } from "vitest";
import type { NumberRef, Statement } from "../contracts/claims";
import { TOOL_DEFINITIONS, TOOL_NAMES } from "../contracts/tools";
import { checkLimit, checkStatement, extractNumbers } from "./claims";
import { ToolSession } from "./tools";

const BASE = { timeoutMs: 1000, retries: 0, circuitBreaker: false, bulkhead: null };

// run-1 fault alone, run-2 retries=3, run-3 breaker; compare(1,2) and compare(1,3) recorded.
let s: ToolSession;
beforeEach(() => {
  s = new ToolSession();
  s.call("simulate", { knobs: BASE, paymentSlowdown: 20, seed: 1 });
  s.call("simulate", { knobs: { ...BASE, retries: 3 }, paymentSlowdown: 20, seed: 1 });
  s.call("simulate", { knobs: { ...BASE, circuitBreaker: true }, paymentSlowdown: 20, seed: 1 });
  s.call("compare", { runA: "run-1", runB: "run-2" });
  s.call("compare", { runA: "run-1", runB: "run-3" });
});

const metric = (runId: string, path: string): number => {
  const v = s.getRun(runId)?.metrics[path];
  if (typeof v !== "number") throw new Error(`no metric ${runId}.${path}`);
  return v;
};
const stmt = (text: string, numbers: NumberRef[] = [], comparison: Statement["comparison"] = null): Statement => ({
  text,
  numbers,
  comparison,
});
const ref = (token: string, path: string): NumberRef => ({ token, kind: "metric", path });
const pct = (x: number, d = 0) => `${(x * 100).toFixed(d)}%`;

describe("number extraction", () => {
  test("ignores run ids, p95-style names and model ids, keeps real numbers", () => {
    const got = extractNumbers("run-3 had p95 latency of 2,968 ms on muse-spark-1.3, errorRate 91.8% and retries=3");
    expect(got.map((n) => n.normalized)).toEqual(["2968", "91.8", "3"]);
    expect(got[1].percent).toBe(true);
    expect(got[1].decimals).toBe(1);
  });
});

describe("claim checker: numbers must match recorded metrics", () => {
  test("a matching percentage and a matching raw value pass", () => {
    const e = metric("run-1", "errorRate");
    expect(checkStatement(stmt(`The fault run failed ${pct(e)} of requests.`, [ref(pct(e), "run-1.errorRate")]), s)).toEqual([]);
    expect(checkStatement(stmt(`errorRate was ${e}.`, [ref(String(e), "run-1.errorRate")]), s)).toEqual([]);
  });

  test("a fabricated number is blocked with the recorded value in the reason", () => {
    const e = metric("run-1", "errorRate");
    const wrong = ((e * 100 + 12) % 100).toFixed(0) + "%";
    const reasons = checkStatement(stmt(`The fault run failed ${wrong} of requests.`, [ref(wrong, "run-1.errorRate")]), s);
    expect(reasons.length).toBe(1);
    expect(reasons[0]).toContain("run-1.errorRate");
  });

  test("a number with no reference is blocked", () => {
    const reasons = checkStatement(stmt("Order rejected 41 requests."), s);
    expect(reasons.join(" ")).toContain("41");
  });

  test("a reference whose token is not in the text is blocked", () => {
    const e = metric("run-1", "errorRate");
    const reasons = checkStatement(stmt("The fault run failed most requests.", [ref(pct(e), "run-1.errorRate")]), s);
    expect(reasons.join(" ")).toContain("not found in the text");
  });

  test("rounding must follow the stated precision", () => {
    const e = metric("run-2", "errorRate");
    const good = e.toFixed(2);
    const bad = (e + 0.05).toFixed(2);
    expect(checkStatement(stmt(`errorRate ${good}`, [ref(good, "run-2.errorRate")]), s)).toEqual([]);
    expect(checkStatement(stmt(`errorRate ${bad}`, [ref(bad, "run-2.errorRate")]), s).length).toBe(1);
  });

  test("unknown run, unknown path and unavailable metrics are blocked", () => {
    expect(checkStatement(stmt("value 5", [ref("5", "run-9.errorRate")]), s).join(" ")).toContain("UNKNOWN_RUN");
    expect(checkStatement(stmt("value 5", [ref("5", "run-1.revenue")]), s).join(" ")).toContain("UNKNOWN_PATH");
  });

  test("knob values are checked against the recorded call arguments", () => {
    const ok: NumberRef = { token: "3", kind: "knob", runId: "run-2", field: "retries" };
    const bad: NumberRef = { token: "3", kind: "knob", runId: "run-1", field: "retries" };
    expect(checkStatement(stmt("Run run-2 used retries=3.", [ok]), s)).toEqual([]);
    expect(checkStatement(stmt("Run run-1 used retries=3.", [bad]), s).length).toBe(1);
  });

  test("seeds are checked against the recorded call", () => {
    expect(checkStatement(stmt("Both used seed 1.", [{ token: "1", kind: "seed", runId: "run-1" }]), s)).toEqual([]);
    expect(checkStatement(stmt("Both used seed 2.", [{ token: "2", kind: "seed", runId: "run-1" }]), s).length).toBe(1);
  });

  test("a ratio and a difference between runs are computed from recorded values", () => {
    const ratio = metric("run-2", "paymentAttemptsPerRequest") / metric("run-1", "paymentAttemptsPerRequest");
    const r = ratio.toFixed(1);
    const n: NumberRef = {
      token: r,
      kind: "ratio",
      numerator: "run-2.paymentAttemptsPerRequest",
      denominator: "run-1.paymentAttemptsPerRequest",
    };
    expect(checkStatement(stmt(`Payment attempts per request were ${r}x higher.`, [n]), s)).toEqual([]);
    const diff = (metric("run-3", "degraded") - metric("run-1", "degraded")).toFixed(0);
    const d: NumberRef = { token: diff, kind: "difference", from: "run-1.degraded", to: "run-3.degraded" };
    expect(checkStatement(stmt(`${diff} more degraded responses.`, [d]), s)).toEqual([]);
    const wrong: NumberRef = { ...n, token: (ratio + 1).toFixed(1) };
    expect(checkStatement(stmt(`${wrong.token}x higher`, [wrong]), s).length).toBe(1);
  });

  test("number words are blocked because they cannot be checked", () => {
    expect(checkStatement(stmt("Load was about three times higher."), s).join(" ")).toContain("three");
    expect(checkStatement(stmt("It roughly doubled."), s).join(" ")).toContain("doubled");
  });
});

describe("claim checker: causal and directional wording needs a recorded comparison", () => {
  test("causal wording without a comparison is blocked", () => {
    expect(checkStatement(stmt("Latency rose because retries queued more work."), s).join(" ")).toContain("comparison");
  });

  test("causal wording with a recorded comparison passes; an unrecorded pair is blocked", () => {
    const text = "Latency rose because retries queued more work.";
    expect(checkStatement(stmt(text, [], { runA: "run-1", runB: "run-2" }), s)).toEqual([]);
    expect(checkStatement(stmt(text, [], { runA: "run-2", runB: "run-3" }), s).join(" ")).toContain("recorded");
  });

  test("a claim about the error rate going the wrong way is blocked by the recorded data", () => {
    const delta = metric("run-2", "errorRate") - metric("run-1", "errorRate");
    const comparison = { runA: "run-1", runB: "run-2" };
    const wrongWay = delta > 0 ? "Retries lowered the error rate." : "Retries raised the error rate.";
    const rightWay = delta > 0 ? "Retries raised the error rate." : "Retries lowered the error rate.";
    expect(checkStatement(stmt(wrongWay, [], comparison), s).length).toBe(1);
    expect(checkStatement(stmt(rightWay, [], comparison), s)).toEqual([]);
  });

  test("a negated sentence is not treated as a directional claim", () => {
    expect(checkStatement(stmt("Retries did not raise the error rate."), s)).toEqual([]);
  });

  test("a directional error-rate claim without a comparison is blocked", () => {
    expect(checkStatement(stmt("The breaker cut the error rate."), s).join(" ")).toContain("comparison");
  });
});

describe("limits", () => {
  test("limits may not contain unchecked numbers", () => {
    expect(checkLimit("These results describe a template model, not real capacity.", s)).toEqual([]);
    expect(checkLimit("Only 500 requests were simulated.", s).length).toBe(1);
  });
});

describe("conclude tool", () => {
  const goodClaim = () => {
    const e = metric("run-1", "errorRate");
    return stmt(`The fault run failed ${pct(e)} of requests.`, [ref(pct(e), "run-1.errorRate")]);
  };

  test("is part of the tool set and the model definitions", () => {
    expect(TOOL_NAMES).toContain("conclude");
    expect(TOOL_DEFINITIONS.map((t) => t.name)).toContain("conclude");
  });

  test("accepts fully supported statements and records the conclusion", () => {
    const r = s.call("conclude", { claims: [goodClaim()], rejectedProposals: [], limits: ["Template model, not real capacity."] });
    expect(r.ok).toBe(true);
    expect(s.conclusion?.claims.length).toBe(1);
    expect(s.blocked.length).toBe(0);
  });

  test("blocks the whole call when any statement fails and keeps no conclusion", () => {
    const bad = stmt("Order rejected 41 requests.");
    const r = s.call("conclude", { claims: [goodClaim(), bad], rejectedProposals: [], limits: ["Template model."] });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("CLAIM_BLOCKED");
      expect(JSON.stringify(r.error.details)).toContain("41");
    }
    expect(s.conclusion).toBeNull();
    expect(s.blocked.length).toBe(1);
    expect(s.blocked[0].section).toBe("claims");
  });

  test("an insufficient-evidence conclusion with no claims is valid", () => {
    const r = s.call("conclude", { claims: [], rejectedProposals: [], limits: ["The budget was used before a fix was confirmed."] });
    expect(r.ok).toBe(true);
  });

  test("unknown fields and missing limits are rejected", () => {
    const extra = s.call("conclude", { claims: [], rejectedProposals: [], limits: ["x"], mood: "sure" });
    expect(extra.ok === false && extra.error.code).toBe("UNKNOWN_FIELD");
    const noLimits = s.call("conclude", { claims: [], rejectedProposals: [], limits: [] });
    expect(noLimits.ok === false && noLimits.error.code).toBe("INVALID_ARGS");
    const badRef = s.call("conclude", {
      claims: [{ text: "x", comparison: null, numbers: [{ token: "1", kind: "metric", path: "run-1.errorRate", extra: 1 }] }],
      rejectedProposals: [],
      limits: ["x"],
    });
    expect(badRef.ok === false && badRef.error.code).toBe("UNKNOWN_FIELD");
  });
});
