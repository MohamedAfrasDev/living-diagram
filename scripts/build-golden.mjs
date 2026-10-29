// Builds a golden run (lib/agent/replay.ts format) from a real /api/agent
// transcript. Nothing is invented: entries and outcome are copied from the
// NDJSON the route streamed. The key is never written; if MODEL_API_KEY is set
// in .env.local, the build aborts when that value appears in the transcript.
//
// Usage: node scripts/build-golden.mjs <transcript.ndjson> <out.json> "<note>"
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const [input, output, note] = process.argv.slice(2);
if (!input || !output || !note) {
  console.error('Usage: node scripts/build-golden.mjs <transcript.ndjson> <out.json> "<note>"');
  process.exit(1);
}

// Same FNV-1a as lib/engine/rng.ts; replay.test.ts fails if they ever diverge.
function fnv1a(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

const raw = readFileSync(input, "utf-8");
const env = existsSync(".env.local") ? readFileSync(".env.local", "utf-8") : "";
for (const line of env.split(/\r?\n/)) {
  const m = /^MODEL_API_KEY=(.+)$/.exec(line.trim());
  if (m && raw.includes(m[1].replace(/^"|"$/g, ""))) {
    console.error("The API key appears in the transcript. Aborting.");
    process.exit(1);
  }
}

const lines = raw.split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
const entries = lines.filter((l) => l.kind === "entry").map((l) => l.entry);
const last = lines.at(-1);
if (!last || last.kind !== "outcome") {
  console.error("The transcript has no outcome line.");
  process.exit(1);
}
const first = entries.find((e) => e.kind === "user");

const recorded = {
  date: new Date().toISOString().slice(0, 10),
  model: "muse-spark-1.3",
  engineVersion: "1.0",
  source: input.replace(/\\/g, "/"),
  note,
};
const question = first.text;
const outcome = {
  status: last.status,
  detail: last.detail,
  turns: last.turns,
  usage: last.usage,
  conclusion: last.conclusion,
  blocked: last.blocked,
};
const contentHash = fnv1a(JSON.stringify({ recorded, question, entries, outcome }));
const golden = { formatVersion: 1, replay: true, recorded, question, entries, outcome, contentHash };
writeFileSync(output, JSON.stringify(golden, null, 2) + "\n");
console.log(`Wrote ${output}: ${entries.length} entries, status ${outcome.status}, hash ${contentHash}`);
