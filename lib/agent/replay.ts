// Golden run format and verifier (docs/03-agent-and-tools.md section 6).
// A golden run is a recorded real agent session. Replay mode shows it under a
// visible "Replay" label, and it is only shown after every recorded tool call
// has been re-executed on the live engine and produced exactly the recorded
// result, so a replay can never show something today's engine would not. Pure
// TypeScript with no Node imports, so the browser can run it too.
import type { BlockedStatement, Conclusion } from "../contracts/claims";
import { fnv1a } from "../engine/rng";
import { ENGINE_VERSION } from "../engine/scenario";
import type { TranscriptEntry } from "./loop";
import { ToolSession } from "./tools";

export interface GoldenOutcome {
  status: string;
  detail: string;
  turns: number;
  usage: { toolCalls: number; simulations: number };
  conclusion: Conclusion | null;
  blocked: BlockedStatement[];
}

export interface GoldenRun {
  formatVersion: 1;
  replay: true;
  recorded: { date: string; model: string; engineVersion: string; source: string; note: string };
  question: string;
  entries: TranscriptEntry[];
  outcome: GoldenOutcome;
  contentHash: string;
}

export type ReplayErrorCode =
  | "INVALID_FORMAT"
  | "UNSUPPORTED_VERSION"
  | "HASH_MISMATCH"
  | "ENGINE_VERSION_MISMATCH"
  | "SECRET_DETECTED"
  | "EVENT_STREAM_PRESENT"
  | "REPLAY_MISMATCH";

export type VerifyResult =
  | { ok: true; golden: GoldenRun; session: ToolSession; replayedCalls: number }
  | { ok: false; code: ReplayErrorCode; message: string; entryIndex?: number };

// The scripts/build-golden.mjs builder hashes the same object in the same key order.
export function computeContentHash(g: Pick<GoldenRun, "recorded" | "question" | "entries" | "outcome">): string {
  return fnv1a(JSON.stringify({ recorded: g.recorded, question: g.question, entries: g.entries, outcome: g.outcome }));
}

const SECRET_PATTERNS = [/Bearer\s+[A-Za-z0-9._-]{8,}/, /\bsk-[A-Za-z0-9_-]{10,}/, /MODEL_API_KEY\s*[=:]/];

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

// First path at which two JSON values differ, or null when equal.
function firstDifference(a: unknown, b: unknown, path = "$"): string | null {
  if (a === b) return null;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return `${path}.length`;
    for (let i = 0; i < a.length; i++) {
      const d = firstDifference(a[i], b[i], `${path}[${i}]`);
      if (d) return d;
    }
    return null;
  }
  if (isRecord(a) && isRecord(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) {
      if (!(k in a) || !(k in b)) return `${path}.${k}`;
      const d = firstDifference(a[k], b[k], `${path}.${k}`);
      if (d) return d;
    }
    return null;
  }
  return path;
}

const fail = (code: ReplayErrorCode, message: string, entryIndex?: number): VerifyResult => ({
  ok: false,
  code,
  message,
  ...(entryIndex === undefined ? {} : { entryIndex }),
});

export function verifyGolden(raw: unknown): VerifyResult {
  if (!isRecord(raw)) return fail("INVALID_FORMAT", "a golden run must be a JSON object");
  if (typeof raw.formatVersion === "number" && raw.formatVersion !== 1) {
    return fail("UNSUPPORTED_VERSION", `format version ${raw.formatVersion} is not supported`);
  }
  const { recorded, question, entries, outcome, contentHash } = raw;
  if (
    raw.formatVersion !== 1 ||
    raw.replay !== true ||
    !isRecord(recorded) ||
    typeof recorded.engineVersion !== "string" ||
    typeof recorded.model !== "string" ||
    typeof recorded.note !== "string" ||
    typeof question !== "string" ||
    !Array.isArray(entries) ||
    !isRecord(outcome) ||
    !isRecord(outcome.usage) ||
    !Array.isArray(outcome.blocked) ||
    typeof contentHash !== "string"
  ) {
    return fail("INVALID_FORMAT", "the golden run is missing required fields");
  }
  const golden = raw as unknown as GoldenRun;

  // Structure: every tool_result directly follows its own tool_call.
  for (let i = 0; i < golden.entries.length; i++) {
    const e = golden.entries[i];
    if (e.kind === "tool_result") {
      const prev = golden.entries[i - 1];
      if (!prev || prev.kind !== "tool_call" || prev.callId !== e.callId || prev.name !== e.name) {
        return fail("INVALID_FORMAT", "a tool result does not follow its tool call", i);
      }
    }
    if (e.kind === "tool_call") {
      const next = golden.entries[i + 1];
      if (!next || next.kind !== "tool_result" || next.callId !== e.callId) {
        return fail("INVALID_FORMAT", "a tool call has no matching result", i);
      }
    }
  }

  if (computeContentHash(golden) !== golden.contentHash) {
    return fail("HASH_MISMATCH", "the recording was edited after it was hashed");
  }
  if (golden.recorded.engineVersion !== ENGINE_VERSION) {
    return fail(
      "ENGINE_VERSION_MISMATCH",
      `recorded with engine ${golden.recorded.engineVersion}, current engine is ${ENGINE_VERSION}`,
    );
  }
  const text = JSON.stringify(golden);
  if (SECRET_PATTERNS.some((p) => p.test(text))) return fail("SECRET_DETECTED", "the recording contains key-like text");
  if (text.includes('"visitId"')) return fail("EVENT_STREAM_PRESENT", "the recording contains the engine event stream");

  // Re-execute every recorded tool call on the live engine.
  const session = new ToolSession();
  let replayedCalls = 0;
  for (let i = 0; i < golden.entries.length; i++) {
    const e = golden.entries[i];
    if (e.kind !== "tool_call") continue;
    const recordedResult = golden.entries[i + 1];
    if (recordedResult.kind !== "tool_result") continue;
    const got = session.call(e.name, e.args);
    replayedCalls++;
    const diff = firstDifference(got, recordedResult.result);
    if (diff) {
      return fail("REPLAY_MISMATCH", `${e.name} no longer produces the recorded result (differs at ${diff})`, i + 1);
    }
  }
  const replayed = {
    conclusion: session.conclusion,
    blocked: session.blocked,
    usage: session.usage,
  };
  for (const key of ["conclusion", "blocked", "usage"] as const) {
    const diff = firstDifference(JSON.parse(JSON.stringify(replayed[key])), golden.outcome[key]);
    if (diff) return fail("REPLAY_MISMATCH", `the recorded outcome.${key} differs from the replay (at ${diff})`);
  }
  return { ok: true, golden, session, replayedCalls };
}
