// Typed tool layer over the engine (docs/03-agent-and-tools.md). The agent acts
// only through ToolSession.call. Unknown tools or arguments are rejected, every
// number comes from a recorded engine run, and the model never receives the
// full event stream (rule 8).
import type { BlockedStatement, Conclusion, Statement } from "../contracts/claims";
import {
  KNOB_FIELDS,
  parseCompareArgs,
  parseConcludeArgs,
  parseGetMetricsArgs,
  parseGetTraceArgs,
  parseProposePatchArgs,
  parseSimulateArgs,
  TOOL_NAMES,
  type ToolError,
  type ToolErrorCode,
  type ToolName,
  type ToolResult,
} from "../contracts/tools";
import { ARRIVAL_COUNT } from "../engine/scenario";
import { simulate, type EngineEvent, type Knobs, type SimulationResult } from "../engine/simulate";
import { checkLimit, checkStatement, type Evidence } from "./claims";
import { flattenMetrics, HEADLINE_PATHS, type MetricValue } from "./metrics";

export const MAX_SIMULATIONS = 8;
export const MAX_TOOL_CALLS = 24;
const MAX_TRACE_EVENTS = 60;

export interface StoredRun {
  runId: string;
  seed: number;
  paymentSlowdown: 1 | 20;
  knobs: Knobs;
  result: SimulationResult;
  metrics: Record<string, MetricValue>;
}

export interface LoggedCall {
  name: string;
  args: unknown;
  result: ToolResult<unknown>;
}

export interface ToolSessionOptions {
  maxSimulations?: number;
  maxToolCalls?: number;
}

const err = (code: ToolErrorCode, message: string, details?: unknown): { ok: false; error: ToolError } => ({
  ok: false,
  error: details === undefined ? { code, message } : { code, message, details },
});

const isToolName = (name: string): name is ToolName => (TOOL_NAMES as readonly string[]).includes(name);

export class ToolSession implements Evidence {
  readonly log: LoggedCall[] = [];
  readonly blocked: BlockedStatement[] = [];
  conclusion: Conclusion | null = null;
  private readonly comparisons = new Set<string>();
  private readonly runs = new Map<string, StoredRun>();
  private toolCalls = 0;
  private simulations = 0;
  private readonly maxSimulations: number;
  private readonly maxToolCalls: number;

  constructor(options: ToolSessionOptions = {}) {
    this.maxSimulations = options.maxSimulations ?? MAX_SIMULATIONS;
    this.maxToolCalls = options.maxToolCalls ?? MAX_TOOL_CALLS;
  }

  get usage(): { toolCalls: number; simulations: number } {
    return { toolCalls: this.toolCalls, simulations: this.simulations };
  }

  getRun(runId: string): StoredRun | undefined {
    return this.runs.get(runId);
  }

  // True when a compare call for this pair (either order) succeeded.
  hasComparison(runA: string, runB: string): boolean {
    return this.comparisons.has(`${runA}|${runB}`) || this.comparisons.has(`${runB}|${runA}`);
  }

  call(name: string, args: unknown): ToolResult<unknown> {
    const result = this.dispatch(name, args);
    this.log.push({ name, args, result });
    return result;
  }

  private dispatch(name: string, args: unknown): ToolResult<unknown> {
    // Rejected calls count too, so a looping model cannot burn unbounded calls.
    if (this.toolCalls >= this.maxToolCalls) {
      return err("BUDGET_EXCEEDED", `tool call budget of ${this.maxToolCalls} is used`);
    }
    this.toolCalls++;
    if (!isToolName(name)) return err("UNKNOWN_TOOL", `unknown tool "${name}"`);
    switch (name) {
      case "simulate":
        return this.simulateTool(args);
      case "get_metrics":
        return this.getMetrics(args);
      case "get_trace":
        return this.getTrace(args);
      case "propose_patch":
        return this.proposePatch(args);
      case "compare":
        return this.compare(args);
      case "conclude":
        return this.concludeTool(args);
    }
  }

  private simulateTool(args: unknown): ToolResult<unknown> {
    const parsed = parseSimulateArgs(args);
    if (!parsed.ok) return parsed;
    if (this.simulations >= this.maxSimulations) {
      return err("BUDGET_EXCEEDED", `simulation budget of ${this.maxSimulations} is used`);
    }
    this.simulations++;
    const { knobs, paymentSlowdown, seed } = parsed.value;
    const result = simulate({ seed, knobs, paymentSlowdown, recordEvents: true });
    if (result.status !== "complete") {
      return err("RUN_INCOMPLETE", "the run exceeded its event budget; its results are not ranked");
    }
    const runId = `run-${this.runs.size + 1}`;
    const metrics = flattenMetrics(result);
    this.runs.set(runId, { runId, seed, paymentSlowdown, knobs, result, metrics });
    const headline: Record<string, MetricValue> = {};
    for (const path of HEADLINE_PATHS) headline[path] = metrics[path] ?? null;
    return {
      ok: true,
      data: { runId, status: result.status, engineVersion: result.engineVersion, runHash: result.runHash, metrics: headline },
    };
  }

  private getMetrics(args: unknown): ToolResult<unknown> {
    const parsed = parseGetMetricsArgs(args);
    if (!parsed.ok) return parsed;
    const run = this.runs.get(parsed.value.runId);
    if (!run) return err("UNKNOWN_RUN", `unknown run "${parsed.value.runId}"`);
    const wanted = parsed.value.paths.length === 0 ? Object.keys(run.metrics) : parsed.value.paths;
    const values: Record<string, MetricValue> = {};
    for (const path of wanted) {
      if (!(path in run.metrics)) return err("UNKNOWN_PATH", `unknown metric path "${path}"`);
      values[path] = run.metrics[path];
    }
    return { ok: true, data: { runId: run.runId, values } };
  }

  private getTrace(args: unknown): ToolResult<unknown> {
    const parsed = parseGetTraceArgs(args);
    if (!parsed.ok) return parsed;
    const run = this.runs.get(parsed.value.runId);
    if (!run) return err("UNKNOWN_RUN", `unknown run "${parsed.value.runId}"`);
    const { requestId } = parsed.value;
    if (!Number.isInteger(requestId) || requestId < 1 || requestId > ARRIVAL_COUNT) {
      return err("UNKNOWN_REQUEST", `requestId must be an integer from 1 to ${ARRIVAL_COUNT}`);
    }
    const all: EngineEvent[] = (run.result.events ?? []).filter((e) => e.requestId === requestId);
    const events = all.slice(0, MAX_TRACE_EVENTS).map((e) => ({
      t: e.t,
      type: e.type,
      node: e.node,
      ...(e.code ? { code: e.code } : {}),
    }));
    return { ok: true, data: { runId: run.runId, requestId, events, truncated: all.length > MAX_TRACE_EVENTS } };
  }

  private proposePatch(args: unknown): ToolResult<unknown> {
    const parsed = parseProposePatchArgs(args);
    if (!parsed.ok) return parsed;
    const { baseKnobs, patch } = parsed.value;
    const candidate: Record<string, number | boolean | null> = { ...baseKnobs };
    for (const op of patch) candidate[op.field] = op.value;
    // Re-validate the whole candidate through the same parser as simulate.
    const check = parseSimulateArgs({ knobs: candidate, paymentSlowdown: 1, seed: 0 });
    if (!check.ok) return check;
    const diff = KNOB_FIELDS.flatMap((field) =>
      candidate[field] === baseKnobs[field] ? [] : [{ field, from: baseKnobs[field], to: candidate[field] }],
    );
    return { ok: true, data: { candidateKnobs: check.value.knobs, diff } };
  }

  private compare(args: unknown): ToolResult<unknown> {
    const parsed = parseCompareArgs(args);
    if (!parsed.ok) return parsed;
    const a = this.runs.get(parsed.value.runA);
    const b = this.runs.get(parsed.value.runB);
    if (!a) return err("UNKNOWN_RUN", `unknown run "${parsed.value.runA}"`);
    if (!b) return err("UNKNOWN_RUN", `unknown run "${parsed.value.runB}"`);
    const mismatches: string[] = [];
    if (a.seed !== b.seed) mismatches.push(`seed ${a.seed} vs ${b.seed}`);
    if (a.paymentSlowdown !== b.paymentSlowdown) mismatches.push(`paymentSlowdown ${a.paymentSlowdown} vs ${b.paymentSlowdown}`);
    if (a.result.engineVersion !== b.result.engineVersion) mismatches.push("engine version");
    if (mismatches.length > 0) {
      return err("COMPARISON_MISMATCH", `runs are not comparable: ${mismatches.join(", ")}`);
    }
    const knobDiff = KNOB_FIELDS.flatMap((field) =>
      a.knobs[field] === b.knobs[field] ? [] : [{ field, from: a.knobs[field], to: b.knobs[field] }],
    );
    const deltas: Record<string, { a: MetricValue; b: MetricValue; delta: number | null }> = {};
    for (const path of HEADLINE_PATHS) {
      const av = a.metrics[path] ?? null;
      const bv = b.metrics[path] ?? null;
      deltas[path] = { a: av, b: bv, delta: av === null || bv === null ? null : bv - av };
    }
    this.comparisons.add(`${a.runId}|${b.runId}`);
    return { ok: true, data: { matched: true, runA: a.runId, runB: b.runId, knobDiff, deltas } };
  }

  // All-or-nothing: if any statement is blocked, nothing is concluded and the
  // blocked statements are kept for the UI (they are never shown as conclusions).
  private concludeTool(args: unknown): ToolResult<unknown> {
    const parsed = parseConcludeArgs(args);
    if (!parsed.ok) return parsed;
    const { claims, rejectedProposals, limits } = parsed.value;
    const blocked: BlockedStatement[] = [];
    const check = (section: "claims" | "rejectedProposals", list: Statement[]) => {
      for (const statement of list) {
        const reasons = checkStatement(statement, this);
        if (reasons.length > 0) blocked.push({ section, text: statement.text, reasons });
      }
    };
    check("claims", claims);
    check("rejectedProposals", rejectedProposals);
    for (const limit of limits) {
      const reasons = checkLimit(limit, this);
      if (reasons.length > 0) blocked.push({ section: "limits", text: limit, reasons });
    }
    if (blocked.length > 0) {
      this.blocked.push(...blocked);
      return err("CLAIM_BLOCKED", `${blocked.length} statement(s) were blocked; fix them and call conclude again`, blocked);
    }
    this.conclusion = { claims, rejectedProposals, limits, acceptedAtCall: this.toolCalls };
    return { ok: true, data: { accepted: true, claims: claims.length, rejectedProposals: rejectedProposals.length, limits: limits.length } };
  }
}
