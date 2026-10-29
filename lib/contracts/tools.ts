// Typed tool contracts shared by the engine-facing tool layer, the agent loop
// and the UI (docs/03-agent-and-tools.md). Arguments are validated here and
// rejected, never guessed: unknown tools, unknown fields and bad values all
// return a named error.
import { knobsError, type Knobs } from "../engine/simulate";
import type { ConcludeArgs, NumberRef, Statement } from "./claims";

export const TOOL_NAMES = ["simulate", "get_metrics", "get_trace", "propose_patch", "compare", "conclude"] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

export type ToolErrorCode =
  | "UNKNOWN_TOOL"
  | "INVALID_ARGS"
  | "UNKNOWN_FIELD"
  | "INVALID_KNOBS"
  | "INVALID_FAULT"
  | "BUDGET_EXCEEDED"
  | "UNKNOWN_RUN"
  | "UNKNOWN_PATH"
  | "UNKNOWN_REQUEST"
  | "COMPARISON_MISMATCH"
  | "RUN_INCOMPLETE"
  | "CLAIM_BLOCKED";

export interface ToolError {
  code: ToolErrorCode;
  message: string;
  details?: unknown;
}

export type ToolResult<T> = { ok: true; data: T } | { ok: false; error: ToolError };
export type Parsed<T> = { ok: true; value: T } | { ok: false; error: ToolError };

export const KNOB_FIELDS = ["timeoutMs", "retries", "circuitBreaker", "bulkhead"] as const;
export type KnobField = (typeof KNOB_FIELDS)[number];

export interface SimulateArgs {
  knobs: Knobs;
  paymentSlowdown: 1 | 20;
  seed: number;
}
export interface GetMetricsArgs {
  runId: string;
  paths: string[];
}
export interface GetTraceArgs {
  runId: string;
  requestId: number;
}
export interface PatchOp {
  field: KnobField;
  value: number | boolean | null;
}
export interface ProposePatchArgs {
  baseKnobs: Knobs;
  patch: PatchOp[];
}
export interface CompareArgs {
  runA: string;
  runB: string;
}

const fail = (code: ToolErrorCode, message: string): { ok: false; error: ToolError } => ({
  ok: false,
  error: { code, message },
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Exact-keys check: every key must be known (UNKNOWN_FIELD) and present (INVALID_ARGS).
function exactObject(
  value: unknown,
  keys: readonly string[],
  label: string,
): { ok: true; value: Record<string, unknown> } | { ok: false; error: ToolError } {
  if (!isRecord(value)) return fail("INVALID_ARGS", `${label} must be an object`);
  for (const key of Object.keys(value)) {
    if (!keys.includes(key)) return fail("UNKNOWN_FIELD", `${label} has unknown field "${key}"`);
  }
  for (const key of keys) {
    if (!(key in value)) return fail("INVALID_ARGS", `${label} is missing "${key}"`);
  }
  return { ok: true, value };
}

export function parseKnobs(value: unknown, label = "knobs"): Parsed<Knobs> {
  const obj = exactObject(value, KNOB_FIELDS, label);
  if (!obj.ok) return obj;
  const v = obj.value;
  if (typeof v.timeoutMs !== "number" || typeof v.retries !== "number") {
    return fail("INVALID_KNOBS", "timeoutMs and retries must be numbers");
  }
  if (typeof v.circuitBreaker !== "boolean") return fail("INVALID_KNOBS", "circuitBreaker must be a boolean");
  if (v.bulkhead !== null && typeof v.bulkhead !== "number") {
    return fail("INVALID_KNOBS", "bulkhead must be a number or null");
  }
  const knobs: Knobs = {
    timeoutMs: v.timeoutMs,
    retries: v.retries,
    circuitBreaker: v.circuitBreaker,
    bulkhead: v.bulkhead,
  };
  const message = knobsError(knobs);
  if (message) return fail("INVALID_KNOBS", message);
  return { ok: true, value: knobs };
}

export function parseSimulateArgs(args: unknown): Parsed<SimulateArgs> {
  const obj = exactObject(args, ["knobs", "paymentSlowdown", "seed"], "simulate args");
  if (!obj.ok) return obj;
  const { knobs, paymentSlowdown, seed } = obj.value;
  if (typeof seed !== "number" || !Number.isInteger(seed)) return fail("INVALID_ARGS", "seed must be an integer");
  if (typeof paymentSlowdown !== "number") return fail("INVALID_ARGS", "paymentSlowdown must be a number");
  if (paymentSlowdown !== 1 && paymentSlowdown !== 20) return fail("INVALID_FAULT", "paymentSlowdown must be 1 or 20");
  const parsed = parseKnobs(knobs);
  if (!parsed.ok) return parsed;
  return { ok: true, value: { knobs: parsed.value, paymentSlowdown, seed } };
}

export function parseGetMetricsArgs(args: unknown): Parsed<GetMetricsArgs> {
  const obj = exactObject(args, ["runId", "paths"], "get_metrics args");
  if (!obj.ok) return obj;
  const { runId, paths } = obj.value;
  if (typeof runId !== "string") return fail("INVALID_ARGS", "runId must be a string");
  if (!Array.isArray(paths) || paths.some((p) => typeof p !== "string")) {
    return fail("INVALID_ARGS", "paths must be an array of strings");
  }
  return { ok: true, value: { runId, paths: paths as string[] } };
}

export function parseGetTraceArgs(args: unknown): Parsed<GetTraceArgs> {
  const obj = exactObject(args, ["runId", "requestId"], "get_trace args");
  if (!obj.ok) return obj;
  const { runId, requestId } = obj.value;
  if (typeof runId !== "string") return fail("INVALID_ARGS", "runId must be a string");
  if (typeof requestId !== "number") return fail("INVALID_ARGS", "requestId must be a number");
  return { ok: true, value: { runId, requestId } };
}

export function parseProposePatchArgs(args: unknown): Parsed<ProposePatchArgs> {
  const obj = exactObject(args, ["baseKnobs", "patch"], "propose_patch args");
  if (!obj.ok) return obj;
  const base = parseKnobs(obj.value.baseKnobs, "baseKnobs");
  if (!base.ok) return base;
  const { patch } = obj.value;
  if (!Array.isArray(patch) || patch.length === 0) return fail("INVALID_ARGS", "patch must be a non-empty array");
  const ops: PatchOp[] = [];
  const seen = new Set<string>();
  for (const raw of patch) {
    const op = exactObject(raw, ["field", "value"], "patch operation");
    if (!op.ok) return op;
    const { field, value } = op.value;
    if (typeof field !== "string" || !(KNOB_FIELDS as readonly string[]).includes(field)) {
      return fail("UNKNOWN_FIELD", `patch field "${String(field)}" is not one of ${KNOB_FIELDS.join(", ")}`);
    }
    if (seen.has(field)) return fail("INVALID_ARGS", `patch changes "${field}" more than once`);
    seen.add(field);
    if (value !== null && typeof value !== "number" && typeof value !== "boolean") {
      return fail("INVALID_KNOBS", `patch value for "${field}" must be a number, boolean or null`);
    }
    ops.push({ field: field as KnobField, value });
  }
  return { ok: true, value: { baseKnobs: base.value, patch: ops } };
}

export function parseCompareArgs(args: unknown): Parsed<CompareArgs> {
  const obj = exactObject(args, ["runA", "runB"], "compare args");
  if (!obj.ok) return obj;
  const { runA, runB } = obj.value;
  if (typeof runA !== "string" || typeof runB !== "string") return fail("INVALID_ARGS", "runA and runB must be strings");
  return { ok: true, value: { runA, runB } };
}


const RUN_ID = /^run-\d+$/;
const MAX_CLAIMS = 8;
const MAX_TEXT = 600;

function parseNumberRef(raw: unknown): Parsed<NumberRef> {
  if (!isRecord(raw)) return fail("INVALID_ARGS", "a number reference must be an object");
  const kind = raw.kind;
  const keys: Record<string, readonly string[]> = {
    metric: ["token", "kind", "path"],
    knob: ["token", "kind", "runId", "field"],
    seed: ["token", "kind", "runId"],
    ratio: ["token", "kind", "numerator", "denominator"],
    difference: ["token", "kind", "from", "to"],
  };
  if (typeof kind !== "string" || !(kind in keys)) {
    return fail("INVALID_ARGS", "number reference kind must be metric, knob, seed, ratio or difference");
  }
  const obj = exactObject(raw, keys[kind], `${kind} reference`);
  if (!obj.ok) return obj;
  const v = obj.value;
  for (const key of keys[kind]) {
    if (typeof v[key] !== "string") return fail("INVALID_ARGS", `${kind} reference "${key}" must be a string`);
  }
  if (kind === "knob" && !(KNOB_FIELDS as readonly string[]).includes(v.field as string)) {
    return fail("UNKNOWN_FIELD", `knob reference field "${String(v.field)}" is not a knob`);
  }
  if ((kind === "knob" || kind === "seed") && !RUN_ID.test(v.runId as string)) {
    return fail("INVALID_ARGS", "runId must look like run-1");
  }
  return { ok: true, value: v as unknown as NumberRef };
}

function parseStatement(raw: unknown, label: string): Parsed<Statement> {
  const obj = exactObject(raw, ["text", "numbers", "comparison"], label);
  if (!obj.ok) return obj;
  const { text, numbers, comparison } = obj.value;
  if (typeof text !== "string" || text.trim().length === 0 || text.length > MAX_TEXT) {
    return fail("INVALID_ARGS", `${label} text must be a non-empty string of at most ${MAX_TEXT} characters`);
  }
  if (!Array.isArray(numbers)) return fail("INVALID_ARGS", `${label} numbers must be an array`);
  const refs: NumberRef[] = [];
  for (const n of numbers) {
    const parsed = parseNumberRef(n);
    if (!parsed.ok) return parsed;
    refs.push(parsed.value);
  }
  let cmp: Statement["comparison"] = null;
  if (comparison !== null) {
    const c = exactObject(comparison, ["runA", "runB"], `${label} comparison`);
    if (!c.ok) return c;
    if (typeof c.value.runA !== "string" || typeof c.value.runB !== "string") {
      return fail("INVALID_ARGS", `${label} comparison runA and runB must be strings`);
    }
    cmp = { runA: c.value.runA, runB: c.value.runB };
  }
  return { ok: true, value: { text, numbers: refs, comparison: cmp } };
}

export function parseConcludeArgs(args: unknown): Parsed<ConcludeArgs> {
  const obj = exactObject(args, ["claims", "rejectedProposals", "limits"], "conclude args");
  if (!obj.ok) return obj;
  const { claims, rejectedProposals, limits } = obj.value;
  if (!Array.isArray(claims) || claims.length > MAX_CLAIMS) {
    return fail("INVALID_ARGS", `claims must be an array of at most ${MAX_CLAIMS}`);
  }
  if (!Array.isArray(rejectedProposals) || rejectedProposals.length > MAX_CLAIMS) {
    return fail("INVALID_ARGS", `rejectedProposals must be an array of at most ${MAX_CLAIMS}`);
  }
  if (!Array.isArray(limits) || limits.length === 0 || limits.length > MAX_CLAIMS) {
    return fail("INVALID_ARGS", `limits must be a non-empty array of at most ${MAX_CLAIMS} strings`);
  }
  if (limits.some((l) => typeof l !== "string" || l.trim().length === 0 || l.length > MAX_TEXT)) {
    return fail("INVALID_ARGS", "every limit must be a non-empty string");
  }
  const parsedClaims: Statement[] = [];
  for (const c of claims) {
    const p = parseStatement(c, "claim");
    if (!p.ok) return p;
    parsedClaims.push(p.value);
  }
  const parsedRejected: Statement[] = [];
  for (const c of rejectedProposals) {
    const p = parseStatement(c, "rejected proposal");
    if (!p.ok) return p;
    parsedRejected.push(p.value);
  }
  return { ok: true, value: { claims: parsedClaims, rejectedProposals: parsedRejected, limits: limits as string[] } };
}

// Tool definitions in the Responses API flat format. `strict` is left off:
// arguments are always validated in our own code (docs/03, D-022).
export interface ToolDefinition {
  type: "function";
  name: ToolName;
  description: string;
  parameters: { type: "object"; properties: Record<string, unknown>; required: string[]; additionalProperties: false };
}

const knobsSchema = {
  type: "object",
  properties: {
    timeoutMs: { type: "integer", minimum: 50, maximum: 5000 },
    retries: { type: "integer", minimum: 0, maximum: 5 },
    circuitBreaker: { type: "boolean" },
    bulkhead: { type: ["integer", "null"], minimum: 1, maximum: 20 },
  },
  required: ["timeoutMs", "retries", "circuitBreaker", "bulkhead"],
  additionalProperties: false,
};

const statementSchema = {
  type: "object",
  properties: {
    text: { type: "string" },
    numbers: {
      type: "array",
      items: {
        type: "object",
        properties: {
          token: { type: "string", description: "the number exactly as written in text, for example 91.8% or 3" },
          kind: { type: "string", enum: ["metric", "knob", "seed", "ratio", "difference"] },
          path: { type: "string", description: "metric: run-2.errorRate" },
          runId: { type: "string", description: "knob and seed: run-2" },
          field: { type: "string", enum: [...KNOB_FIELDS], description: "knob: which knob" },
          numerator: { type: "string", description: "ratio: metric path" },
          denominator: { type: "string", description: "ratio: metric path" },
          from: { type: "string", description: "difference: metric path" },
          to: { type: "string", description: "difference: metric path; value is to minus from" },
        },
        required: ["token", "kind"],
        additionalProperties: false,
      },
    },
    comparison: {
      anyOf: [
        { type: "null" },
        {
          type: "object",
          properties: { runA: { type: "string" }, runB: { type: "string" } },
          required: ["runA", "runB"],
          additionalProperties: false,
        },
      ],
    },
  },
  required: ["text", "numbers", "comparison"],
  additionalProperties: false,
};

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: "function",
    name: "simulate",
    description:
      "Run the deterministic simulator once with the given knobs and seed. paymentSlowdown is 1 (healthy) or 20 (payment 20x slower). Returns a run id and headline metrics recorded by the engine.",
    parameters: {
      type: "object",
      properties: { knobs: knobsSchema, paymentSlowdown: { type: "integer", enum: [1, 20] }, seed: { type: "integer" } },
      required: ["knobs", "paymentSlowdown", "seed"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "get_metrics",
    description:
      "Return recorded metric values for a run, for example errorRate, paymentAttemptsPerRequest, latencyMs.p95, nodes.order.occupiedSlotFraction. An empty paths array returns every available path.",
    parameters: {
      type: "object",
      properties: { runId: { type: "string" }, paths: { type: "array", items: { type: "string" } } },
      required: ["runId", "paths"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "get_trace",
    description: "Return the recorded per-hop events (at most 60) for one logical request id (1 to 500) in a run.",
    parameters: {
      type: "object",
      properties: { runId: { type: "string" }, requestId: { type: "integer", minimum: 1, maximum: 500 } },
      required: ["runId", "requestId"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "propose_patch",
    description:
      "Propose a change to the four knobs as typed operations. Returns the candidate knobs and a diff. It does not run anything; call simulate with the candidate to test it.",
    parameters: {
      type: "object",
      properties: {
        baseKnobs: knobsSchema,
        patch: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            properties: {
              field: { type: "string", enum: [...KNOB_FIELDS] },
              value: { type: ["integer", "boolean", "null"] },
            },
            required: ["field", "value"],
            additionalProperties: false,
          },
        },
      },
      required: ["baseKnobs", "patch"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "compare",
    description:
      "Compare two recorded runs. They must share the same seed, paymentSlowdown and engine version; only knob values may differ. Returns the knob diff and metric deltas (B minus A).",
    parameters: {
      type: "object",
      properties: { runA: { type: "string" }, runB: { type: "string" } },
      required: ["runA", "runB"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "conclude",
    description:
      "Finish the investigation. Every number you write in a claim or rejected proposal must be digits and must be listed in numbers with a reference to a recorded value: metric (path like run-2.errorRate), knob (a knob value of a recorded run), seed, ratio, or difference. Causal or directional wording (because, raised, lowered the error rate) needs a comparison of two runs you compared with the compare tool. Limits must contain no numbers. An empty claims array with limits is a valid insufficient-evidence answer. A blocked statement is not shown; fix it and call conclude again.",
    parameters: {
      type: "object",
      properties: {
        claims: { type: "array", items: statementSchema },
        rejectedProposals: { type: "array", items: statementSchema },
        limits: { type: "array", minItems: 1, items: { type: "string" } },
      },
      required: ["claims", "rejectedProposals", "limits"],
      additionalProperties: false,
    },
  },
];
