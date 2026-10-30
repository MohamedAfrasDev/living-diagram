// Pure helpers for the workspace UI: turning a transcript into runs the
// canvas and evidence panel can re-run on the live engine, and reading the
// occupancy timeline. No React here, so it is unit-tested.
import { parseSimulateArgs } from "../contracts/tools";
import type { TranscriptEntry } from "../agent/loop";
import { DEFAULT_SCENARIO, canonicalScenario, type Scenario } from "../engine/scenario";
import { TIMELINE_STEP_MS, type Knobs, type SimulateInput, type TimelineSample } from "../engine/simulate";

export const DEFAULT_KNOBS: Knobs = { timeoutMs: 1000, retries: 0, circuitBreaker: false, bulkhead: null };

export interface UiRun {
  id: string;
  source: "agent" | "manual";
  knobs: Knobs;
  // 1 (healthy) or the fault factor of the numbers the run used.
  paymentSlowdown: number;
  seed: number;
  // The numbers the run was made on. Agent and replay runs use the template.
  scenario: Scenario;
}

// Every successful simulate call in a transcript, with the inputs the agent
// sent. Calls without a result yet (a live stream in progress) are skipped.
export function extractRuns(entries: readonly TranscriptEntry[], scenario: Scenario = DEFAULT_SCENARIO): UiRun[] {
  const pending = new Map<string, unknown>();
  const runs: UiRun[] = [];
  for (const e of entries) {
    if (e.kind === "tool_call" && e.name === "simulate") {
      pending.set(e.callId, e.args);
    } else if (e.kind === "tool_result" && e.name === "simulate" && e.result.ok && pending.has(e.callId)) {
      const parsed = parseSimulateArgs(pending.get(e.callId), scenario);
      const data = e.result.data as { runId?: unknown };
      if (parsed.ok && typeof data.runId === "string") {
        runs.push({ id: data.runId, source: "agent", ...parsed.value, scenario });
      }
    }
  }
  return runs;
}

export function runInput(run: UiRun, recordTimeline = false): SimulateInput {
  return { seed: run.seed, knobs: run.knobs, paymentSlowdown: run.paymentSlowdown, scenario: run.scenario, recordTimeline };
}

// Runs are only comparable when they were made on the same numbers.
export function sameNumbers(a: UiRun, b: UiRun): boolean {
  return JSON.stringify(canonicalScenario(a.scenario)) === JSON.stringify(canonicalScenario(b.scenario));
}

export function describeKnobs(k: Knobs): string {
  const parts: string[] = [];
  if (k.timeoutMs !== DEFAULT_KNOBS.timeoutMs) parts.push(`timeout ${k.timeoutMs} ms`);
  if (k.retries !== DEFAULT_KNOBS.retries) parts.push(`retries ${k.retries}`);
  if (k.circuitBreaker) parts.push("breaker on");
  if (k.bulkhead !== null) parts.push(`bulkhead ${k.bulkhead}`);
  return parts.length === 0 ? "defaults" : parts.join(", ");
}

// The sample at or before t, clamped to the ends of the timeline.
export function sampleAt(timeline: readonly TimelineSample[], t: number): TimelineSample {
  const index = Math.min(timeline.length - 1, Math.max(0, Math.floor(t / TIMELINE_STEP_MS)));
  return timeline[index];
}
