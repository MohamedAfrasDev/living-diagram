import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { computeContentHash, verifyGolden, type GoldenRun } from "./replay";

const PATH = "public/golden/slow-payment-run-1.json";
const load = (): GoldenRun => JSON.parse(readFileSync(PATH, "utf-8")) as GoldenRun;

// Tamper, then re-hash, so the content hash passes and only the engine replay can catch it.
function tampered(mutate: (g: GoldenRun) => void): GoldenRun {
  const g = structuredClone(load());
  mutate(g);
  g.contentHash = computeContentHash(g);
  return g;
}

const firstIndex = (g: GoldenRun, name: string, kind: "tool_call" | "tool_result") =>
  g.entries.findIndex((e) => e.kind === kind && "name" in e && e.name === name);

describe("golden run replay", () => {
  test("the committed golden run verifies against the live engine", () => {
    const r = verifyGolden(load());
    expect(r.ok).toBe(true);
    if (r.ok) {
      const calls = r.golden.entries.filter((e) => e.kind === "tool_call").length;
      expect(r.replayedCalls).toBe(calls);
      expect(r.session.conclusion?.claims.length).toBeGreaterThan(0);
      expect(r.session.blocked.length).toBe(r.golden.outcome.blocked.length);
    }
  });

  test("is labeled as a replay with its provenance", () => {
    const g = load();
    expect(g.replay).toBe(true);
    expect(g.recorded.model).toBe("muse-spark-1.3");
    expect(g.recorded.note.length).toBeGreaterThan(10);
  });

  test("an edited transcript without a matching hash is HASH_MISMATCH", () => {
    const g = structuredClone(load());
    const i = g.entries.findIndex((e) => e.kind === "assistant_text");
    (g.entries[i] as { text: string }).text += " (edited)";
    const r = verifyGolden(g);
    expect(r.ok === false && r.code).toBe("HASH_MISMATCH");
  });

  test("a changed simulate result is REPLAY_MISMATCH at that entry even with a valid hash", () => {
    const g = tampered((x) => {
      const i = firstIndex(x, "simulate", "tool_result");
      const entry = x.entries[i] as { result: { ok: true; data: { metrics: Record<string, number> } } };
      entry.result.data.metrics.errorRate += 0.01;
    });
    const r = verifyGolden(g);
    expect(r.ok === false && r.code).toBe("REPLAY_MISMATCH");
    if (!r.ok) expect(r.entryIndex).toBe(firstIndex(g, "simulate", "tool_result"));
  });

  test("changed tool call arguments are caught because the engine result differs", () => {
    const g = tampered((x) => {
      const i = firstIndex(x, "simulate", "tool_call");
      const entry = x.entries[i] as { args: { seed: number } };
      entry.args.seed += 5;
    });
    const r = verifyGolden(g);
    expect(r.ok === false && r.code).toBe("REPLAY_MISMATCH");
  });

  test("an edited final conclusion is REPLAY_MISMATCH", () => {
    const g = tampered((x) => {
      x.outcome.conclusion!.claims[0].text += " It was perfect.";
    });
    const r = verifyGolden(g);
    expect(r.ok === false && r.code).toBe("REPLAY_MISMATCH");
  });

  test("a recording from another engine version is rejected", () => {
    const r = verifyGolden(tampered((x) => void (x.recorded.engineVersion = "0.9")));
    expect(r.ok === false && r.code).toBe("ENGINE_VERSION_MISMATCH");
  });

  test("unknown format versions and malformed files are rejected", () => {
    const v = tampered((x) => void ((x as unknown as { formatVersion: number }).formatVersion = 2));
    expect(verifyGolden(v).ok === false && (verifyGolden(v) as { code: string }).code).toBe("UNSUPPORTED_VERSION");
    for (const bad of [null, "x", {}, { formatVersion: 1 }, { ...load(), entries: "no" }]) {
      const r = verifyGolden(bad);
      expect(r.ok === false && ["INVALID_FORMAT", "UNSUPPORTED_VERSION"].includes(r.code)).toBe(true);
    }
  });

  test("a tool result without its call is INVALID_FORMAT", () => {
    const g = tampered((x) => {
      const i = firstIndex(x, "simulate", "tool_call");
      x.entries.splice(i, 1);
    });
    const r = verifyGolden(g);
    expect(r.ok === false && r.code).toBe("INVALID_FORMAT");
  });

  test("key-like secrets are rejected", () => {
    const g = tampered((x) => {
      const i = x.entries.findIndex((e) => e.kind === "assistant_text");
      (x.entries[i] as { text: string }).text = "debug Authorization: Bearer abcdefghijklmnop";
    });
    expect(verifyGolden(g).ok === false && (verifyGolden(g) as { code: string }).code).toBe("SECRET_DETECTED");
    const h = tampered((x) => {
      const i = x.entries.findIndex((e) => e.kind === "assistant_text");
      (x.entries[i] as { text: string }).text = "key sk-abcdefghijklmnopqrstuv";
    });
    expect((verifyGolden(h) as { code: string }).code).toBe("SECRET_DETECTED");
  });

  test("a recording that contains the engine event stream is rejected (rule 8)", () => {
    const g = tampered((x) => {
      const i = firstIndex(x, "simulate", "tool_result");
      (x.entries[i] as unknown as { result: { data: Record<string, unknown> } }).result.data.events = [{ visitId: 1 }];
    });
    const r = verifyGolden(g);
    expect(r.ok === false && r.code).toBe("EVENT_STREAM_PRESENT");
  });
});
