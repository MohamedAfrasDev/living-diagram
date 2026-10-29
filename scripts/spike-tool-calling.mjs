// Tool-calling spike for the Meta Model API (docs/02-rules-and-spike.md).
// Not part of the product. Reads MODEL_API_KEY from the environment and never
// prints or stores it. Usage (PowerShell):
//   $env:MODEL_API_KEY = "<your key>"; node scripts/spike-tool-calling.mjs
// Optional: SPIKE_RUNS (default 10), SPIKE_MODEL (default muse-spark-1.3).
// Results are also written to scripts/spike-results.json (no key in it).
import { writeFileSync } from "node:fs";

const key = process.env.MODEL_API_KEY;
if (!key) {
  console.error("Set MODEL_API_KEY first.");
  process.exit(1);
}
const BASE = "https://api.meta.ai/v1";
const MODEL = process.env.SPIKE_MODEL ?? "muse-spark-1.3";
const RUNS = Number(process.env.SPIKE_RUNS ?? 10);
const MAX_TURNS = 6;

const tools = [
  {
    type: "function",
    name: "simulate",
    description: "Run the simulator once and return a run id plus headline metrics.",
    parameters: {
      type: "object",
      properties: {
        retries: { type: "integer", minimum: 0, maximum: 5 },
        paymentSlowdown: { type: "integer", enum: [1, 20] },
      },
      required: ["retries", "paymentSlowdown"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "get_metrics",
    description: "Return a recorded metric for a run id.",
    parameters: {
      type: "object",
      properties: { runId: { type: "string" }, path: { type: "string", enum: ["errorRate", "offered", "succeeded", "failed"] } },
      required: ["runId", "path"],
      additionalProperties: false,
    },
  },
];

const CANNED = { runId: "run-1", offered: 500, succeeded: 500, failed: 0, errorRate: 0 };
const toolNames = new Set(tools.map((t) => t.name));

function argsMatch(name, args) {
  const keys = Object.keys(args ?? {}).sort().join(",");
  if (name === "simulate") {
    return keys === "paymentSlowdown,retries" && Number.isInteger(args.retries) && args.retries >= 0 && args.retries <= 5 && [1, 20].includes(args.paymentSlowdown);
  }
  if (name === "get_metrics") {
    return keys === "path,runId" && typeof args.runId === "string" && ["errorRate", "offered", "succeeded", "failed"].includes(args.path);
  }
  return false;
}

// Numbers a final answer may contain: tool results, simple percentages derived
// from them, and values the model itself passed as tool arguments (docs/03
// section 5: knob values are checked against recorded call arguments).
function allowedNumbers(argNumbers) {
  const set = new Set([CANNED.offered, CANNED.succeeded, CANNED.failed, CANNED.errorRate, ...argNumbers]);
  set.add(CANNED.errorRate * 100);
  set.add((1 - CANNED.errorRate) * 100);
  set.add((CANNED.succeeded / CANNED.offered) * 100);
  return set;
}

function answerUsesOnlyReturnedNumbers(text, argNumbers) {
  const cleaned = text.replace(/run-\d+/gi, "").replace(/muse-spark-[\d.]+/gi, "");
  const nums = (cleaned.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  const allowed = allowedNumbers(argNumbers);
  return nums.every((n) => allowed.has(n));
}

// Bounded retry for transport errors only (429, 5xx, network). A provider
// outage is not a model failure, so it is retried and counted separately.
let transportRetries = 0;
async function post(body) {
  let last;
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) {
      transportRetries++;
      await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** (attempt - 1)));
    }
    try {
      const res = await fetch(`${BASE}/responses`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) return await res.json();
      const text = (await res.text()).slice(0, 300);
      last = new Error(`HTTP ${res.status}: ${text}`);
      if (res.status !== 429 && res.status < 500) throw last;
    } catch (e) {
      last = e;
      if (String(e.message).startsWith("HTTP 4") && !String(e.message).startsWith("HTTP 429")) throw e;
    }
  }
  throw last;
}

async function oneRun(index) {
  const score = { run: index + 1, a: true, b: true, c: true, d: false, calls: 0, note: "" };
  const argNumbers = new Set();
  const prompt = "Run the baseline (retries 0, no fault) and report the error rate. Use only the tools.";
  let input = prompt;
  let previous;
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const body = { model: MODEL, input, tools, tool_choice: "auto", ...(previous ? { previous_response_id: previous } : {}) };
    const out = await post(body);
    previous = out.id;
    const calls = (out.output ?? []).filter((o) => o.type === "function_call");
    if (calls.length === 0) {
      const text = (out.output ?? [])
        .filter((o) => o.type === "message")
        .flatMap((o) => o.content ?? [])
        .map((c) => c.text ?? "")
        .join(" ");
      if (score.calls === 0) {
        score.note = "answered without calling a tool";
        score.a = false;
      }
      score.d = score.calls > 0 && answerUsesOnlyReturnedNumbers(text, argNumbers);
      if (!score.d && score.calls > 0) score.note = `answer: ${text.slice(0, 120)}`;
      return score;
    }
    const outputs = [];
    for (const call of calls) {
      score.calls++;
      if (!toolNames.has(call.name)) {
        score.c = false;
        score.a = false;
        outputs.push({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify({ error: "UNKNOWN_TOOL" }) });
        continue;
      }
      let args;
      try {
        args = JSON.parse(call.arguments);
      } catch {
        score.b = false;
        outputs.push({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify({ error: "INVALID_ARGS" }) });
        continue;
      }
      if (!argsMatch(call.name, args)) score.b = false;
      for (const v of Object.values(args ?? {})) if (typeof v === "number") argNumbers.add(v);
      const result = call.name === "simulate" ? CANNED : { runId: args.runId, [args.path]: CANNED[args.path] };
      outputs.push({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify(result) });
    }
    input = outputs;
  }
  score.note = "no final answer within turn limit";
  return score;
}

const rows = [];
for (let i = 0; i < RUNS; i++) {
  try {
    rows.push(await oneRun(i));
  } catch (e) {
    rows.push({ run: i + 1, a: false, b: false, c: false, d: false, calls: 0, transport: true, note: String(e.message).slice(0, 200) });
  }
  const r = rows[rows.length - 1];
  console.log(`run ${r.run}: a=${+r.a} b=${+r.b} c=${+r.c} d=${+r.d} calls=${r.calls} ${r.note}`);
}
const passed = rows.filter((r) => r.a && r.b && r.c && r.d).length;
const transportFailures = rows.filter((r) => r.transport).length;
console.log(`\n${passed}/${rows.length} runs pass all four checks (go if at least 9 of 10).`);
console.log(`Transport retries: ${transportRetries}. Runs lost to provider errors after retries: ${transportFailures}.`);
writeFileSync(
  new URL("./spike-results.json", import.meta.url),
  JSON.stringify({ model: MODEL, rows, passed, transportRetries, transportFailures }, null, 2),
);
