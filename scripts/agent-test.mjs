// T13 agent test (docs/07-eval-and-submission.md section 2). Runs 6 live
// investigations through the real /api/agent route with different phrasings,
// saves each NDJSON transcript, and scores them with rules fixed BEFORE running:
//
//   valid calls      : the run did not end invalid_output or provider_unavailable
//   confirmed fix    : judged from the engine's recorded outputs in the transcript,
//                      not from the agent's claims. The fix is the non-default knob set
//                      cited most in accepted claims. Confirmed when, under the fault on
//                      at least 2 seeds, its errorRate <= 0.5 x the default-knob fault run
//                      on the same seed; a healthy run with the same knobs has degraded 0;
//                      and an accepted claim cites its degraded or degradedRate (D-017).
//   self-corrected   : first fix tried under the fault failed that bar, and the final
//                      confirmed fix is a different knob set (reported, no bar)
//   unsupported nums : accepted-claim numbers that contradict a recorded value
//                      (must be 0); values not present in the transcript are counted
//                      separately as "unverifiable here"
//
// Usage: node scripts/agent-test.mjs http://localhost:3100 trial2   (outputs go to data/runs/<trial>/)
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const BASE = process.argv[2] ?? "http://localhost:3100";
const TRIAL = process.argv[3] ?? "trial";
const OUT = new URL(`../data/runs/${TRIAL}/`, import.meta.url);
mkdirSync(OUT, { recursive: true });

const PROMPTS = [
  "Checkout is failing because payment is slow. Find a fix and show me the evidence.",
  "Our payment provider has become much slower and checkout is timing out. Which setting change would you make? Prove it with experiments.",
  "Customers see errors at checkout. I suspect adding retries will help. Test that idea and tell me what you find.",
  "Payment latency spiked. Should I turn on a circuit breaker, add a bulkhead, or tune the timeout? Evaluate and recommend.",
  "Review our resilience settings under a slow payment dependency and tell me what is safe to change.",
  "Checkout error rates are high. Do not assume anything: find out why, and whether a config change can fix it, or tell me honestly if you cannot.",
];

const DEFAULT = { timeoutMs: 1000, retries: 0, circuitBreaker: false, bulkhead: null };
const knobKey = (k) => JSON.stringify([k.timeoutMs, k.retries, k.circuitBreaker, k.bulkhead]);
const DEFAULT_KEY = knobKey(DEFAULT);

async function runOne(prompt) {
  const res = await fetch(`${BASE}/api/agent`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question: prompt }),
    signal: AbortSignal.timeout(600_000),
  });
  const text = await res.text();
  if (!res.ok) return { raw: text, lines: [], error: `HTTP ${res.status}: ${text.slice(0, 200)}` };
  const lines = text.split("\n").filter(Boolean).map((l) => JSON.parse(l));
  return { raw: text, lines };
}

function roundsTo(value, token) {
  const percent = token.trim().endsWith("%");
  const digits = token.replace(/[,%\s]/g, "");
  const decimals = (digits.split(".")[1] ?? "").length;
  const expected = percent ? value * 100 : value;
  return Number(expected.toFixed(decimals)) === Number(digits);
}

function score(lines) {
  const outcome = lines.at(-1);
  const entries = lines.filter((l) => l.kind === "entry").map((l) => l.entry);
  const callsById = new Map();
  const runs = new Map(); // runId -> { knobs, slow, seed, metrics }
  const values = new Map(); // "run-1.errorRate" -> number
  const rejectedByCode = {};
  let toolCalls = 0;
  const order = [];
  for (const e of entries) {
    if (e.kind === "tool_call") {
      callsById.set(e.callId, e);
      toolCalls++;
    } else if (e.kind === "tool_result") {
      const call = callsById.get(e.callId);
      if (!e.result.ok) {
        rejectedByCode[e.result.error.code] = (rejectedByCode[e.result.error.code] ?? 0) + 1;
        continue;
      }
      const d = e.result.data;
      if (e.name === "simulate" && call) {
        runs.set(d.runId, { knobs: call.args.knobs, slow: call.args.paymentSlowdown, seed: call.args.seed });
        for (const [p, v] of Object.entries(d.metrics)) values.set(`${d.runId}.${p}`, v);
        order.push(d.runId);
      } else if (e.name === "get_metrics") {
        for (const [p, v] of Object.entries(d.values)) values.set(`${d.runId}.${p}`, v);
      }
    }
  }

  const status = outcome?.status ?? "no_outcome";
  const validCalls = !["invalid_output", "provider_unavailable", "no_outcome"].includes(status);
  const claims = outcome?.conclusion?.claims ?? [];

  // The fix is the non-default knob set most cited by accepted claims.
  const cited = new Map();
  for (const c of claims) {
    for (const n of c.numbers) {
      const id = n.kind === "metric" ? n.path.split(".")[0] : n.runId;
      const run = id && runs.get(id);
      if (run && run.slow === 20 && knobKey(run.knobs) !== DEFAULT_KEY) cited.set(knobKey(run.knobs), (cited.get(knobKey(run.knobs)) ?? 0) + 1);
    }
  }
  const fixKey = [...cited.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  const faultByKeySeed = (key, seed) => [...runs.entries()].find(([, r]) => r.slow === 20 && knobKey(r.knobs) === key && r.seed === seed)?.[0];
  const passesBar = (runId, seed) => {
    const base = faultByKeySeed(DEFAULT_KEY, seed);
    const e = values.get(`${runId}.errorRate`);
    const b = base && values.get(`${base}.errorRate`);
    return typeof e === "number" && typeof b === "number" ? e <= 0.5 * b : null;
  };

  let confirmed = false;
  let why = "no fix claimed";
  if (fixKey) {
    const fixRuns = [...runs.entries()].filter(([, r]) => r.slow === 20 && knobKey(r.knobs) === fixKey);
    const seedsPassing = new Set(fixRuns.filter(([id, r]) => passesBar(id, r.seed) === true).map(([, r]) => r.seed));
    const healthy = [...runs.entries()].find(([, r]) => r.slow === 1 && knobKey(r.knobs) === fixKey);
    const healthyOk = healthy ? values.get(`${healthy[0]}.degraded`) === 0 : false;
    const fixIds = new Set(fixRuns.map(([id]) => id));
    const degradedReported = claims.some((c) => c.numbers.some((n) => n.kind === "metric" && /\.degraded(Rate)?$/.test(n.path) && fixIds.has(n.path.split(".")[0])));
    confirmed = seedsPassing.size >= 2 && healthyOk && degradedReported;
    why = `fix ${fixKey}: seeds passing ${[...seedsPassing].join(",") || "none"}; healthy undegraded ${healthyOk}; degraded reported ${degradedReported}`;
  }

  // Self-correction: the first fix tried under the fault failed the bar and the confirmed fix differs.
  const firstFix = order.map((id) => runs.get(id)).find((r) => r.slow === 20 && knobKey(r.knobs) !== DEFAULT_KEY);
  let selfCorrected = false;
  if (firstFix && confirmed && knobKey(firstFix.knobs) !== fixKey) {
    const id = order.find((rid) => runs.get(rid) === firstFix);
    selfCorrected = passesBar(id, firstFix.seed) === false;
  }

  // Independent check of accepted-claim numbers against recorded values.
  let unsupported = 0;
  let unverifiable = 0;
  for (const c of claims) {
    for (const n of c.numbers) {
      let recorded;
      if (n.kind === "metric") recorded = values.get(n.path);
      else if (n.kind === "knob") recorded = runs.get(n.runId)?.knobs[n.field];
      else if (n.kind === "seed") recorded = runs.get(n.runId)?.seed;
      else if (n.kind === "ratio") {
        const a = values.get(n.numerator);
        const b = values.get(n.denominator);
        recorded = typeof a === "number" && typeof b === "number" && b !== 0 ? a / b : undefined;
      } else if (n.kind === "difference") {
        const a = values.get(n.from);
        const b = values.get(n.to);
        recorded = typeof a === "number" && typeof b === "number" ? b - a : undefined;
      }
      if (typeof recorded !== "number") unverifiable++;
      else if (!roundsTo(recorded, n.token)) unsupported++;
    }
  }

  return {
    status,
    detail: outcome?.detail,
    turns: outcome?.turns,
    usage: outcome?.usage,
    validCalls,
    rejectedByCode,
    confirmed,
    why,
    selfCorrected,
    blockedStatements: outcome?.blocked?.length ?? 0,
    claims: claims.length,
    unsupported,
    unverifiable,
    seedsUsed: [...new Set([...runs.values()].map((r) => r.seed))],
    toolCalls,
  };
}

// Dry run: SCORE_FILE=path node scripts/agent-test.mjs scores a saved transcript without any network call.
if (process.env.SCORE_FILE) {
  const lines = readFileSync(process.env.SCORE_FILE, "utf-8").split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
  console.log(JSON.stringify(score(lines), null, 2));
  process.exit(0);
}

const rows = [];
for (let i = 0; i < PROMPTS.length; i++) {
  const started = Date.now();
  let result;
  try {
    result = await runOne(PROMPTS[i]);
  } catch (e) {
    result = { raw: "", lines: [], error: String(e.message).slice(0, 200) };
  }
  writeFileSync(new URL(`agent-test-${i + 1}.ndjson`, OUT), result.raw);
  const row = result.error ? { run: i + 1, prompt: PROMPTS[i], status: "route_error", error: result.error, validCalls: false, confirmed: false } : { run: i + 1, prompt: PROMPTS[i], ...score(result.lines) };
  row.seconds = Math.round((Date.now() - started) / 1000);
  rows.push(row);
  console.log(`run ${row.run}: status=${row.status} valid=${+row.validCalls} confirmed=${+row.confirmed} selfCorrected=${+(row.selfCorrected ?? 0)} blocked=${row.blockedStatements ?? 0} unsupported=${row.unsupported ?? 0} unverifiable=${row.unverifiable ?? 0} sims=${row.usage?.simulations ?? "-"} turns=${row.turns ?? "-"} ${row.seconds}s`);
  console.log(`        ${row.why ?? row.error ?? ""}`);
}

const n = (f) => rows.filter(f).length;
const summary = {
  runs: rows.length,
  validCalls: n((r) => r.validCalls),
  confirmedFix: n((r) => r.confirmed),
  selfCorrected: n((r) => r.selfCorrected),
  unsupportedNumbers: rows.reduce((a, r) => a + (r.unsupported ?? 0), 0),
  unverifiableNumbers: rows.reduce((a, r) => a + (r.unverifiable ?? 0), 0),
  blockedStatements: rows.reduce((a, r) => a + (r.blockedStatements ?? 0), 0),
  bars: { validCalls: ">= 5 of 6", confirmedFix: ">= 4 of 6", unsupportedNumbers: "0" },
};
console.log("\n" + JSON.stringify(summary, null, 2));
writeFileSync(new URL("agent-test-summary.json", OUT), JSON.stringify({ summary, rows }, null, 2));
