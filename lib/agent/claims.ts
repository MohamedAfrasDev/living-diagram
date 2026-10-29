// Claim checker (docs/03-agent-and-tools.md section 5, AGENTS.md rule 4). A
// numeric claim must match a recorded value; anything else is blocked, not
// shown. Causal and directional wording needs a recorded comparison.
import type { NumberRef, Statement } from "../contracts/claims";
import type { StoredRun } from "./tools";

export interface Evidence {
  getRun(runId: string): StoredRun | undefined;
  hasComparison(runA: string, runB: string): boolean;
}

export interface ExtractedNumber {
  raw: string;
  normalized: string;
  value: number;
  decimals: number;
  percent: boolean;
}

// Digits are only extracted when they stand alone: run ids (run-3), names like
// p95 and model ids (muse-spark-1.3) are not numbers a claim makes.
const NUMBER_RE = /(?<![A-Za-z_.\d])(?<![A-Za-z]-)(\d+(?:,\d{3})*(?:\.(\d+))?)(%)?/g;

export function extractNumbers(text: string): ExtractedNumber[] {
  const cleaned = text.replace(/run-\d+/gi, "      ");
  const out: ExtractedNumber[] = [];
  for (const m of cleaned.matchAll(NUMBER_RE)) {
    const index = m.index ?? 0;
    const negative = cleaned[index - 1] === "-";
    const digits = m[1].replace(/,/g, "");
    out.push({
      raw: (negative ? "-" : "") + m[1] + (m[3] ?? ""),
      normalized: (negative ? "-" : "") + digits,
      value: (negative ? -1 : 1) * Number(digits),
      decimals: m[2]?.length ?? 0,
      percent: m[3] === "%",
    });
  }
  return out;
}

// Spelled-out numbers cannot be matched to a metric, so they are blocked.
// "one" is left out because it is also a pronoun.
const NUMBER_WORDS =
  /\b(zero|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|dozen|half|halved|double|doubled|triple|tripled|twice)\b/gi;

function numberWords(text: string): string[] {
  return [...new Set([...text.matchAll(NUMBER_WORDS)].map((m) => m[0].toLowerCase()))];
}

const CAUSAL = /\b(because|caused|causes|cause of|due to|led to|leads to|resulted in|results in|therefore|as a result|this is why|so that)\b/i;
const NEGATION = /\b(not|never|no|without|nor|neither)\b|n't\b/i;
const INCREASE = /\b(rais|increas|worse|worsen|higher|rose|rise|climb|spik)\w*/i;
const DECREASE = /\b(lower|reduc|cut|drop|decreas|fell|improv|halv|fewer)\w*/i;

type Resolved = { ok: true; value: number; label: string } | { ok: false; reason: string };

function metricValue(path: string, ev: Evidence): Resolved {
  const m = /^(run-\d+)\.(.+)$/.exec(path);
  if (!m) return { ok: false, reason: `"${path}" is not a metric path like run-1.errorRate` };
  const run = ev.getRun(m[1]);
  if (!run) return { ok: false, reason: `UNKNOWN_RUN: ${m[1]} was not recorded` };
  if (!(m[2] in run.metrics)) return { ok: false, reason: `UNKNOWN_PATH: ${m[2]} is not a recorded metric` };
  const value = run.metrics[m[2]];
  if (value === null) return { ok: false, reason: `${path} is unavailable (no samples)` };
  return { ok: true, value, label: path };
}

function resolveRef(ref: NumberRef, ev: Evidence): Resolved {
  switch (ref.kind) {
    case "metric":
      return metricValue(ref.path, ev);
    case "knob": {
      const run = ev.getRun(ref.runId);
      if (!run) return { ok: false, reason: `UNKNOWN_RUN: ${ref.runId} was not recorded` };
      const v = run.knobs[ref.field];
      if (typeof v !== "number") return { ok: false, reason: `${ref.runId} knob ${ref.field} is ${String(v)}, not a number` };
      return { ok: true, value: v, label: `${ref.runId} knob ${ref.field}` };
    }
    case "seed": {
      const run = ev.getRun(ref.runId);
      if (!run) return { ok: false, reason: `UNKNOWN_RUN: ${ref.runId} was not recorded` };
      return { ok: true, value: run.seed, label: `${ref.runId} seed` };
    }
    case "ratio": {
      const n = metricValue(ref.numerator, ev);
      if (!n.ok) return n;
      const d = metricValue(ref.denominator, ev);
      if (!d.ok) return d;
      if (d.value === 0) return { ok: false, reason: `${ref.denominator} is 0, so the ratio is undefined` };
      return { ok: true, value: n.value / d.value, label: `${ref.numerator} / ${ref.denominator}` };
    }
    case "difference": {
      const from = metricValue(ref.from, ev);
      if (!from.ok) return from;
      const to = metricValue(ref.to, ev);
      if (!to.ok) return to;
      return { ok: true, value: to.value - from.value, label: `${ref.to} - ${ref.from}` };
    }
  }
}

const normalizeToken = (token: string): string => token.replace(/[,%\s]/g, "");

// The stated number must equal the recorded value rounded to the stated
// precision; a percentage is the recorded value times 100.
function matches(recorded: number, n: ExtractedNumber): boolean {
  const expected = n.percent ? recorded * 100 : recorded;
  return Number(expected.toFixed(n.decimals)) === n.value;
}

function directionReasons(text: string, s: Statement, ev: Evidence): string[] {
  const reasons: string[] = [];
  for (const sentence of text.split(/(?<=[.!?])\s+/)) {
    if (!/error\s?rate/i.test(sentence) || NEGATION.test(sentence)) continue;
    const inc = INCREASE.test(sentence);
    const dec = DECREASE.test(sentence);
    if (inc === dec) continue;
    if (!s.comparison) {
      reasons.push(`a claim about the error rate changing needs a comparison of two recorded runs: "${sentence.trim()}"`);
      continue;
    }
    const a = metricValue(`${s.comparison.runA}.errorRate`, ev);
    const b = metricValue(`${s.comparison.runB}.errorRate`, ev);
    if (!a.ok || !b.ok) continue; // unknown runs are reported by the comparison check
    const delta = b.value - a.value;
    if (inc && delta <= 0) {
      reasons.push(`recorded errorRate went from ${a.value} to ${b.value} (${s.comparison.runA} to ${s.comparison.runB}), not up: "${sentence.trim()}"`);
    }
    if (dec && delta >= 0) {
      reasons.push(`recorded errorRate went from ${a.value} to ${b.value} (${s.comparison.runA} to ${s.comparison.runB}), not down: "${sentence.trim()}"`);
    }
  }
  return reasons;
}

// Returns the reasons a statement is blocked; an empty array means it passes.
export function checkStatement(s: Statement, ev: Evidence): string[] {
  const reasons: string[] = [];

  for (const word of numberWords(s.text)) {
    reasons.push(`"${word}" is a number written as a word; write it as digits with a reference so it can be checked`);
  }

  const found = extractNumbers(s.text);
  const textTokens = new Set(found.map((n) => n.normalized));
  for (const n of found) {
    const refs = s.numbers.filter((r) => normalizeToken(r.token) === n.normalized);
    if (refs.length === 0) {
      reasons.push(`number "${n.raw}" has no supporting reference`);
      continue;
    }
    for (const ref of refs) {
      const resolved = resolveRef(ref, ev);
      if (!resolved.ok) {
        reasons.push(`"${n.raw}": ${resolved.reason}`);
      } else if (!matches(resolved.value, n)) {
        const shown = n.percent ? `${resolved.value} (${resolved.value * 100}%)` : String(resolved.value);
        reasons.push(`"${n.raw}" does not match ${resolved.label} (recorded ${shown})`);
      }
    }
  }
  for (const ref of s.numbers) {
    if (!textTokens.has(normalizeToken(ref.token))) {
      reasons.push(`reference token "${ref.token}" was not found in the text`);
    }
  }

  if (s.comparison && !ev.hasComparison(s.comparison.runA, s.comparison.runB)) {
    reasons.push(`comparison ${s.comparison.runA} vs ${s.comparison.runB} was not recorded by a compare call`);
  }
  if (CAUSAL.test(s.text) && !s.comparison) {
    reasons.push("causal wording (because, led to, ...) needs a comparison of two runs recorded with the compare tool");
  }
  reasons.push(...directionReasons(s.text, s, ev));
  return reasons;
}

// Limits carry scope, not results, so they may not contain numbers at all.
export function checkLimit(text: string, _ev: Evidence): string[] {
  const reasons: string[] = [];
  for (const n of extractNumbers(text)) {
    reasons.push(`limits may not contain numbers (found "${n.raw}"); put numbers in a claim with a reference`);
  }
  for (const word of numberWords(text)) reasons.push(`limits may not contain numbers (found "${word}")`);
  return reasons;
}
