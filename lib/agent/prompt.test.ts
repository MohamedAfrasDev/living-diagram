import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { DEFAULT_SCENARIO, type Scenario } from "../engine/scenario";
import { SYSTEM_PROMPT, buildSystemPrompt } from "./prompt";

const fixture = readFileSync("lib/agent/prompt.default.txt", "utf-8");

const custom = (): Scenario => {
  const s = structuredClone(DEFAULT_SCENARIO) as unknown as {
    nodes: Record<string, { concurrency: number; queueCapacity: number; localMs: number }>;
    arrivalIntervalMs: number;
    cacheMissRate: number;
    faultFactor: number;
  };
  s.nodes.payment = { concurrency: 2, queueCapacity: 3, localMs: 30 };
  s.arrivalIntervalMs = 25;
  s.cacheMissRate = 0.5;
  s.faultFactor = 30;
  return s as unknown as Scenario;
};

describe("G2: the default prompt is unchanged, byte for byte", () => {
  test("buildSystemPrompt(DEFAULT_SCENARIO) equals the text saved before the refactor", () => {
    expect(buildSystemPrompt(DEFAULT_SCENARIO)).toBe(fixture);
  });

  test("SYSTEM_PROMPT is still exported and is the default", () => {
    expect(SYSTEM_PROMPT).toBe(fixture);
  });

  test("a structurally equal copy of the default also gives the default prompt", () => {
    expect(buildSystemPrompt(structuredClone(DEFAULT_SCENARIO) as Scenario)).toBe(fixture);
  });

  test("the default prompt does not mention user-entered numbers", () => {
    expect(fixture).not.toMatch(/entered by the user/i);
  });
});

describe("a custom scenario's prompt", () => {
  const p = buildSystemPrompt(custom());

  test("states the user's load, cache miss rate and fault factor", () => {
    expect(p).toContain("400 requests at a steady 40 per second");
    expect(p).toMatch(/50 percent of requests miss/i);
    expect(p).toContain("paymentSlowdown 30");
    expect(p).toMatch(/30x slower/);
    expect(p).not.toContain("paymentSlowdown 20");
  });

  test("lists the service numbers and says they are the user's inputs, not measurements", () => {
    expect(p).toMatch(/entered by the user/i);
    expect(p).toMatch(/not measurements|not a measurement/i);
    expect(p).toContain("Payment: 2 workers, queue 3, 30 ms");
    expect(p).toContain("Gateway: 100 workers, queue 100, 2 ms");
  });

  test("tells the agent to say so when the healthy system already fails", () => {
    expect(p).toMatch(/healthy system already fails/i);
  });

  test("keeps every rule that protects the evidence", () => {
    for (const must of ["Respond only with tool calls", "never state a number you did not get from a tool", "conclude", "insufficient evidence", "Limits carry scope only"]) {
      expect(p).toContain(must);
    }
  });

  test("the baseline sentence still defines the default knob settings", () => {
    expect(p).toContain("timeoutMs 1000, retries 0, circuitBreaker false, bulkhead null");
  });
});
