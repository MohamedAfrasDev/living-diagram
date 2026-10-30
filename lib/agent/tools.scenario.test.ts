import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { TOOL_DEFINITIONS, parseSimulateArgs, toolDefinitions } from "../contracts/tools";
import { DEFAULT_SCENARIO, arrivalCount, type Scenario } from "../engine/scenario";
import { simulate } from "../engine/simulate";
import { investigate } from "./loop";
import type { ModelTurn, Provider, ProviderRequest } from "./provider";
import { ToolSession } from "./tools";

const BASE = { timeoutMs: 1000, retries: 0, circuitBreaker: false, bulkhead: null };
const customize = (patch: (s: { nodes: Record<string, { concurrency: number; queueCapacity: number; localMs: number }>; arrivalIntervalMs: number; cacheMissRate: number; faultFactor: number }) => void): Scenario => {
  const s = structuredClone(DEFAULT_SCENARIO) as unknown as Parameters<typeof patch>[0];
  patch(s);
  return s as unknown as Scenario;
};
const tiny = customize((s) => {
  s.nodes.payment = { concurrency: 2, queueCapacity: 3, localMs: 30 };
  s.nodes.order = { concurrency: 4, queueCapacity: 2, localMs: 7 };
  s.arrivalIntervalMs = 25;
  s.cacheMissRate = 0.5;
  s.faultFactor = 10;
});
const busy = customize((s) => void (s.arrivalIntervalMs = 10));

const fixture = JSON.parse(readFileSync("lib/contracts/tool-definitions.default.json", "utf-8"));

describe("tool definitions", () => {
  test("the default definitions are unchanged (the agent evaluation depends on them)", () => {
    expect(JSON.parse(JSON.stringify(TOOL_DEFINITIONS))).toEqual(fixture);
    expect(JSON.parse(JSON.stringify(toolDefinitions(DEFAULT_SCENARIO)))).toEqual(fixture);
  });

  test("a custom scenario limits paymentSlowdown to 1 or its fault factor and requestId to its offered count", () => {
    const defs = toolDefinitions(tiny);
    const simulateDef = defs.find((d) => d.name === "simulate");
    const traceDef = defs.find((d) => d.name === "get_trace");
    expect((simulateDef?.parameters.properties.paymentSlowdown as { enum: number[] }).enum).toEqual([1, 10]);
    expect((traceDef?.parameters.properties.requestId as { maximum: number }).maximum).toBe(arrivalCount(tiny));
    expect(simulateDef?.description).toMatch(/10x slower/);
    expect(JSON.stringify(defs)).not.toContain("20x slower");
  });

  test("every definition keeps the strict shape", () => {
    for (const t of toolDefinitions(tiny)) {
      expect(t.parameters.additionalProperties).toBe(false);
      expect(t.name).toMatch(/^[a-zA-Z0-9_.-]+$/);
    }
  });
});

describe("parseSimulateArgs with a scenario", () => {
  const args = (slow: number) => ({ knobs: BASE, paymentSlowdown: slow, seed: 1 });
  test("accepts 1 and the factor, rejects everything else with INVALID_FAULT", () => {
    expect(parseSimulateArgs(args(10), tiny).ok).toBe(true);
    expect(parseSimulateArgs(args(1), tiny).ok).toBe(true);
    for (const bad of [20, 2, 0]) {
      const r = parseSimulateArgs(args(bad), tiny);
      expect(r.ok === false && r.error.code).toBe("INVALID_FAULT");
    }
  });
  test("the default is unchanged when no scenario is given", () => {
    expect(parseSimulateArgs(args(20)).ok).toBe(true);
    expect(parseSimulateArgs(args(10)).ok).toBe(false);
  });
});

describe("ToolSession with a custom scenario", () => {
  test("simulate matches a direct engine run on that scenario", () => {
    const s = new ToolSession({ scenario: tiny });
    const r = s.call("simulate", { knobs: BASE, paymentSlowdown: 10, seed: 1 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const data = r.data as { runHash: string; metrics: Record<string, number> };
      const direct = simulate({ seed: 1, knobs: BASE, paymentSlowdown: 10, scenario: tiny });
      expect(data.runHash).toBe(direct.runHash);
      expect(data.metrics.offered).toBe(arrivalCount(tiny));
      expect(data.metrics.errorRate).toBe(direct.errorRate);
    }
  });

  test("the default factor is rejected on a scenario with another factor", () => {
    const s = new ToolSession({ scenario: tiny });
    const r = s.call("simulate", { knobs: BASE, paymentSlowdown: 20, seed: 1 });
    expect(r.ok === false && r.error.code).toBe("INVALID_FAULT");
  });

  test("get_trace bounds follow the offered count", () => {
    const d = new ToolSession();
    d.call("simulate", { knobs: BASE, paymentSlowdown: 1, seed: 1 });
    expect(d.call("get_trace", { runId: "run-1", requestId: 500 }).ok).toBe(true);
    const over = d.call("get_trace", { runId: "run-1", requestId: 501 });
    expect(over.ok === false && over.error.code).toBe("UNKNOWN_REQUEST");

    const b = new ToolSession({ scenario: busy });
    b.call("simulate", { knobs: BASE, paymentSlowdown: 1, seed: 1 });
    expect(b.call("get_trace", { runId: "run-1", requestId: 1000 }).ok).toBe(true);
    expect(b.call("get_trace", { runId: "run-1", requestId: 1001 }).ok).toBe(false);

    const t = new ToolSession({ scenario: tiny });
    t.call("simulate", { knobs: BASE, paymentSlowdown: 1, seed: 1 });
    expect(t.call("get_trace", { runId: "run-1", requestId: 400 }).ok).toBe(true);
    expect(t.call("get_trace", { runId: "run-1", requestId: 401 }).ok).toBe(false);
  });

  test("compare works inside a custom session and exposes the scenario", () => {
    const s = new ToolSession({ scenario: tiny });
    expect(s.scenario).toEqual(tiny);
    s.call("simulate", { knobs: BASE, paymentSlowdown: 10, seed: 1 });
    s.call("simulate", { knobs: { ...BASE, circuitBreaker: true }, paymentSlowdown: 10, seed: 1 });
    const r = s.call("compare", { runA: "run-1", runB: "run-2" });
    expect(r.ok).toBe(true);
  });

  test("a session with no scenario uses the default", () => {
    expect(new ToolSession().scenario).toEqual(DEFAULT_SCENARIO);
  });
});

describe("the loop gives the model the session's scenario", () => {
  class Capture implements Provider {
    requests: ProviderRequest[] = [];
    async respond(req: ProviderRequest): Promise<ModelTurn> {
      this.requests.push(structuredClone(req));
      return { calls: [{ callId: "c1", name: "conclude", arguments: JSON.stringify({ claims: [], rejectedProposals: [], limits: ["Entered numbers only."] }) }], text: "" };
    }
  }

  test("prompt and tool definitions are built from the custom scenario", async () => {
    const provider = new Capture();
    const out = await investigate({ question: "q", provider, session: new ToolSession({ scenario: tiny }) });
    expect(out.status).toBe("insufficient");
    const req = provider.requests[0];
    expect(req.instructions).toContain("paymentSlowdown 10");
    expect(req.instructions).toMatch(/entered by the user/i);
    const sim = req.tools.find((t) => t.name === "simulate");
    expect((sim?.parameters.properties.paymentSlowdown as { enum: number[] }).enum).toEqual([1, 10]);
  });

  test("with the default scenario the prompt and tools are the saved defaults", async () => {
    const provider = new Capture();
    await investigate({ question: "q", provider });
    expect(provider.requests[0].instructions).toBe(readFileSync("lib/agent/prompt.default.txt", "utf-8"));
    expect(JSON.parse(JSON.stringify(provider.requests[0].tools))).toEqual(fixture);
  });
});
