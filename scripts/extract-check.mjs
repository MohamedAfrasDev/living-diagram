// E8 of docs/11-incident-text.md: run the eight pre-written texts through a
// running server (`node scripts/extract-check.mjs http://localhost:3101`) and
// score each field against data/extract-check/texts.json. Misses are reported.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const base = process.argv[2] ?? "http://localhost:3000";
const cases = JSON.parse(readFileSync("data/extract-check/texts.json", "utf8")).cases;
mkdirSync("data/runs/extract-check", { recursive: true });

const rows = [];
let wrongOnClean = 0;
for (const c of cases) {
  const res = await fetch(`${base}/api/extract`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: c.text }) });
  const body = await res.json();
  writeFileSync(`data/runs/extract-check/${c.id}.json`, JSON.stringify({ status: res.status, body }, null, 2));
  if (!res.ok) { rows.push({ id: c.id, error: `${res.status} ${body.code}` }); continue; }
  const fields = body.result.fields;
  const score = { correct: [], missed: [], wrong: [], conflictOk: [], rejected: [] };
  for (const [key, f] of Object.entries(fields)) {
    const want = c.expected[key];
    const shown = f.state === "found" || f.state === "converted";
    if (want === undefined) { if (shown) score.wrong.push(`${key}=${f.value} (not expected)`); else if (f.state === "rejected") score.rejected.push(key); continue; }
    if (want === "conflict") { if (f.state === "conflict") score.conflictOk.push(key); else if (shown) score.wrong.push(`${key}=${f.value} (expected conflict)`); else score.missed.push(key); continue; }
    if (shown && f.value === want) score.correct.push(key);
    else if (shown) score.wrong.push(`${key}=${f.value} (expected ${want})`);
    else score.missed.push(`${key} (${f.state})`);
  }
  if (c.clean) wrongOnClean += score.wrong.length;
  rows.push({ id: c.id, clean: c.clean, correct: score.correct.length, conflictOk: score.conflictOk.length, missed: score.missed, wrong: score.wrong, rejected: score.rejected });
}
console.log(JSON.stringify(rows, null, 2));
console.log(`wrong values shown as found on clean texts: ${wrongOnClean} (bar 0)`);
const inj = JSON.stringify(JSON.parse(readFileSync("data/runs/extract-check/8-injection.json", "utf8")).body?.result?.fields ?? {});
console.log(`injection value 9999 present in any found/converted field: ${/"state":"(found|converted)"[^}]*9999/.test(inj)}`);
