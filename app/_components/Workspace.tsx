"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { InvestigationStatus, TranscriptEntry } from "@/lib/agent/loop";
import { verifyGolden, type VerifyResult } from "@/lib/agent/replay";
import { DEFAULT_SCENARIO, HORIZON_MS, isDefaultScenario, type Scenario } from "@/lib/engine/scenario";
import { isReplayOnly, liveAgentDisabledReason } from "@/lib/hosting";
import { simulate, type Knobs, type SimulationResult } from "@/lib/engine/simulate";
import { DEFAULT_KNOBS, extractRuns, runInput, sameNumbers, sampleAt, type UiRun } from "@/lib/ui/runs";
import { Canvas, NodeTable } from "./Canvas";
import { Evidence } from "./Evidence";
import { NumbersCard } from "./NumbersCard";
import { ManualRun } from "./ManualRun";
import { Playback, type Speed } from "./Playback";
import { Timeline, type OutcomeView } from "./Timeline";
import { Badge, Card } from "./ui";

const DEFAULT_QUESTION = "Checkout is failing because payment is slow. Find a fix and show me the evidence.";
// The golden run is fetched as a static file, not imported: the bundler rounds
// floating-point numbers in imported JSON in the last digit, which changes the
// recording and (correctly) fails verification. fetch + JSON.parse is exact.
const GOLDEN_URL = "/golden/slow-payment-run-1.json";
const REPLAY_STEP_MS = 450;
// Inlined at build time. On a hosted copy the live agent is off and says why.
const LIVE_DISABLED_REASON = liveAgentDisabledReason(isReplayOnly(process.env.NEXT_PUBLIC_REPLAY_ONLY));
const VIRTUAL_MS_PER_SECOND = 3000;

// Pure and deterministic, so results are cached by their inputs.
const resultCache = new Map<string, SimulationResult>();
function resultFor(run: UiRun): SimulationResult {
  const input = runInput(run, true);
  const key = JSON.stringify([input.seed, input.knobs, input.paymentSlowdown]);
  let hit = resultCache.get(key);
  if (!hit) {
    hit = simulate(input);
    resultCache.set(key, hit);
  }
  return hit;
}

const isDefaultKnobs = (k: Knobs) => JSON.stringify(k) === JSON.stringify(DEFAULT_KNOBS);

// Open on the story: the first change the agent tried, against the fault alone.
function pickDefaults(runs: UiRun[]): { selected: string | null; compare: string | null } {
  const baseline = runs.find((r) => r.paymentSlowdown !== 1 && isDefaultKnobs(r.knobs));
  const firstFix = runs.find((r) => r.paymentSlowdown !== 1 && !isDefaultKnobs(r.knobs) && (!baseline || r.seed === baseline.seed));
  if (firstFix && baseline) return { selected: firstFix.id, compare: baseline.id };
  return { selected: runs[0]?.id ?? null, compare: null };
}

const subscribeMotion = (cb: () => void) => {
  const m = window.matchMedia("(prefers-reduced-motion: reduce)");
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};
const usePrefersReducedMotion = () =>
  useSyncExternalStore(
    subscribeMotion,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );

type LiveLine =
  | { kind: "entry"; entry: TranscriptEntry }
  | { kind: "outcome"; status: InvestigationStatus; detail: string; conclusion: OutcomeView["conclusion"] };

export function Workspace() {
  const reducedMotion = usePrefersReducedMotion();
  const [goldenState, setGoldenState] = useState<{ status: "loading" } | { status: "done"; result: VerifyResult } | { status: "unavailable"; message: string }>({ status: "loading" });
  const verification = goldenState.status === "done" ? goldenState.result : null;
  const golden = verification?.ok ? verification.golden : null;
  const goldenTotal = golden?.entries.length ?? 0;

  const [mode, setMode] = useState<"replay" | "live">("replay");
  const [revealed, setRevealed] = useState(0);
  const [replayRequested, setReplayRequested] = useState(false);
  const [liveEntries, setLiveEntries] = useState<TranscriptEntry[]>([]);
  const [liveOutcome, setLiveOutcome] = useState<OutcomeView | null>(null);
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [question, setQuestion] = useState(DEFAULT_QUESTION);
  const [manualRuns, setManualRuns] = useState<UiRun[]>([]);
  // Your numbers: the current valid numbers, or null while the form is invalid.
  const [scenario, setScenario] = useState<Scenario | null>(DEFAULT_SCENARIO);
  // The numbers the current or last live agent run was made on.
  const [liveScenario, setLiveScenario] = useState<Scenario>(DEFAULT_SCENARIO);
  const abortRef = useRef<AbortController | null>(null);

  const shownReplay = replayRequested ? revealed : goldenTotal;
  const entries = useMemo<TranscriptEntry[]>(() => (mode === "live" ? liveEntries : (golden?.entries.slice(0, shownReplay) ?? [])), [mode, liveEntries, golden, shownReplay]);
  const replaying = mode === "replay" && replayRequested && revealed < goldenTotal;
  const outcome: OutcomeView | null =
    mode === "live" ? liveOutcome : golden && shownReplay >= goldenTotal ? { status: golden.outcome.status as InvestigationStatus, detail: golden.outcome.detail, conclusion: golden.outcome.conclusion } : null;

  // Replay runs are always on the template numbers; live runs use what was sent.
  const agentRuns = useMemo(() => extractRuns(entries, mode === "live" ? liveScenario : DEFAULT_SCENARIO), [entries, mode, liveScenario]);
  const runs = useMemo(() => [...agentRuns, ...manualRuns], [agentRuns, manualRuns]);

  const initial = useMemo(() => pickDefaults(golden ? extractRuns(golden.entries) : []), [golden]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [compareId, setCompareId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(GOLDEN_URL);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const result = verifyGolden(JSON.parse(await res.text()));
        if (cancelled) return;
        setGoldenState({ status: "done", result });
        if (result.ok) {
          const d = pickDefaults(extractRuns(result.golden.entries));
          setSelectedId(d.selected);
          setCompareId(d.compare);
          // Open on the animated story unless the user prefers reduced motion.
          setPlaying(!window.matchMedia("(prefers-reduced-motion: reduce)").matches);
        }
      } catch (e) {
        if (!cancelled) setGoldenState({ status: "unavailable", message: e instanceof Error ? e.message : "unknown error" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  const selectedRun = runs.find((r) => r.id === selectedId) ?? null;
  const compareRun = runs.find((r) => r.id === compareId) ?? null;
  const selected = selectedRun ? resultFor(selectedRun) : null;
  const compare = compareRun ? resultFor(compareRun) : null;

  // Playback of the selected run's engine timeline.
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<Speed>(2);
  const tRef = useRef(0);
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      tRef.current = Math.min(HORIZON_MS, tRef.current + (now - last) * (VIRTUAL_MS_PER_SECOND / 1000) * speed);
      last = now;
      setT(tRef.current);
      if (tRef.current >= HORIZON_MS) {
        setPlaying(false);
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, speed]);

  const seek = useCallback((value: number) => {
    tRef.current = value;
    setT(value);
  }, []);
  const selectRun = useCallback(
    (id: string) => {
      setSelectedId(id);
      seek(reducedMotion ? HORIZON_MS : 0);
      setPlaying(!reducedMotion);
    },
    [reducedMotion, seek],
  );

  // Replay stepping: reveal one recorded entry at a time.
  useEffect(() => {
    if (!replaying) return;
    const id = setInterval(() => setRevealed((r) => Math.min(goldenTotal, r + 1)), REPLAY_STEP_MS);
    return () => clearInterval(id);
  }, [replaying, goldenTotal]);

  const startReplay = () => {
    abortRef.current?.abort();
    setMode("replay");
    setNotice(null);
    setRevealed(0);
    setReplayRequested(!reducedMotion);
  };
  const showAll = () => setReplayRequested(false);

  const cancel = () => abortRef.current?.abort();

  const ask = async () => {
    const q = question.trim();
    if (!q || running || LIVE_DISABLED_REASON || scenario === null) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    setNotice(null);
    setMode("live");
    setLiveScenario(scenario);
    setLiveEntries([]);
    setLiveOutcome(null);
    setSelectedId(null);
    setCompareId(null);
    let gotAny = false;
    try {
      const res = await fetch("/api/agent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(isDefaultScenario(scenario) ? { question: q } : { question: q, scenario }), signal: controller.signal });
      if (!res.ok || !res.body) {
        const body = (await res.json().catch(() => null)) as { code?: string; message?: string } | null;
        if (body?.code === "NO_API_KEY") {
          setNotice("The live agent is unavailable on this server (no API key is configured). Showing the recorded Replay instead.");
        } else if (body?.code === "BUSY") {
          setNotice("Another investigation is already running. Try again in a moment.");
        } else {
          setNotice(body?.message ?? `The agent request failed (HTTP ${res.status}).`);
        }
        setMode("replay");
        setSelectedId(initial.selected);
        setCompareId(initial.compare);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let firstRunSelected = false;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const msg = JSON.parse(line) as LiveLine;
          gotAny = true;
          if (msg.kind === "entry") {
            setLiveEntries((prev) => [...prev, msg.entry]);
            if (!firstRunSelected && msg.entry.kind === "tool_result" && msg.entry.name === "simulate" && msg.entry.result.ok) {
              firstRunSelected = true;
              const id = (msg.entry.result.data as { runId: string }).runId;
              setSelectedId(id);
              seek(0);
              setPlaying(!reducedMotion);
            }
          } else {
            setLiveOutcome({ status: msg.status, detail: msg.detail, conclusion: msg.conclusion });
          }
        }
      }
    } catch (e) {
      if (controller.signal.aborted) {
        setLiveOutcome({ status: "cancelled", detail: "the investigation was cancelled", conclusion: null });
      } else {
        setNotice(gotAny ? "The connection to the agent was lost before it finished. What is shown is incomplete." : "Could not reach the agent. Showing the recorded Replay instead.");
        if (!gotAny) {
          setMode("replay");
          setSelectedId(initial.selected);
          setCompareId(initial.compare);
        }
      }
      void e;
    } finally {
      setRunning(false);
    }
  };

  const runManual = (knobs: Knobs, paymentSlowdown: number, seed: number) => {
    if (scenario === null) return;
    const id = `manual-${manualRuns.length + 1}`;
    const run: UiRun = { id, source: "manual", knobs, paymentSlowdown, seed, scenario };
    setManualRuns((prev) => [...prev, run]);
    // Compare with a matching baseline: same seed, fault and numbers, default settings.
    const baseline = runs.find((r) => r.seed === seed && r.paymentSlowdown === paymentSlowdown && isDefaultKnobs(r.knobs) && sameNumbers(r, run));
    setCompareId(baseline && !isDefaultKnobs(knobs) ? baseline.id : null);
    selectRun(id);
  };

  const sample = selected?.timeline ? sampleAt(selected.timeline, t) : null;
  const badge =
    mode === "live" ? (
      <Badge tone="ok" title="A fresh run by the live Muse Spark agent">
        Live agent
      </Badge>
    ) : (
      <Badge tone="replay" title="A recorded real agent session, not a fresh run">
        Replay
      </Badge>
    );

  return (
    <div className="mx-auto w-full max-w-[1500px] px-4 py-5 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">LivingDiagrams</h1>
          <p className="mt-0.5 max-w-2xl text-sm text-muted">
            An agent that investigates why a backend design fails. It runs controlled experiments on a deterministic simulator and only states what the engine recorded.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {goldenState.status === "loading" ? <Badge title="Re-running the recorded session on the live engine">Verifying replay…</Badge> : null}
          {verification?.ok ? (
            <Badge tone="ok" title="Every recorded tool call was re-run on the live engine and produced the recorded result">
              Replay verified against the live engine · {verification.replayedCalls} calls re-run
            </Badge>
          ) : null}
          {LIVE_DISABLED_REASON ? <Badge tone="replay" title={LIVE_DISABLED_REASON}>Hosted replay copy</Badge> : null}
          <Badge title="Virtual time and template parameters">Template model</Badge>
        </div>
      </header>

      {mode === "replay" ? (
        <div className="mt-4 rounded-lg border border-replay/50 bg-replay-bg px-4 py-2.5 text-sm text-replay" role="note">
          <b>Replay.</b> This is a recorded session with Muse Spark ({golden?.recorded.date ?? "loading"}), not a fresh agent run. It was recorded on the template numbers. The simulator runs live: each recorded step is re-executed on today&apos;s engine and must match.
        </div>
      ) : null}
      {verification && !verification.ok ? (
        <div className="mt-4 rounded-lg border border-danger/50 bg-danger/5 px-4 py-2.5 text-sm text-danger" role="alert">
          <b>The recorded replay failed verification</b> ({verification.code}): {verification.message}. It is not shown. You can still ask the agent or run the simulator by hand.
        </div>
      ) : null}
      {goldenState.status === "unavailable" ? (
        <div className="mt-4 rounded-lg border border-danger/50 bg-danger/5 px-4 py-2.5 text-sm text-danger" role="alert">
          <b>The recorded replay could not be loaded</b> ({goldenState.message}). You can still ask the agent or run the simulator by hand.
        </div>
      ) : null}

      <main className="mt-4 grid gap-4 lg:grid-cols-2 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,0.95fr)] lg:items-start">
        <div className="space-y-4">
          <Card title="System" aside={selectedRun ? <Badge tone="accent">{selectedRun.id}</Badge> : null}>
            {sample && selectedRun ? (
              <>
                <Canvas sample={sample} scenario={selectedRun.scenario} paymentSlowdown={selectedRun.paymentSlowdown} breakerEnabled={selectedRun.knobs.circuitBreaker} />
                <Playback t={t} playing={playing} speed={speed} disabled={false} onToggle={() => (t >= HORIZON_MS ? (seek(0), setPlaying(true)) : setPlaying(!playing))} onSeek={(v) => (setPlaying(false), seek(v))} onSpeed={setSpeed} onRestart={() => (seek(0), setPlaying(!reducedMotion))} />
                <details className="mt-3 text-xs" open={reducedMotion}>
                  <summary className="cursor-pointer text-muted">Show node state as a table</summary>
                  <div className="mt-2">
                    <NodeTable sample={sample} scenario={selectedRun.scenario} />
                  </div>
                </details>
              </>
            ) : (
              <p className="py-10 text-center text-sm text-muted">No run selected. Pick a step in the investigation, or run the simulator by hand.</p>
            )}
          </Card>
          <NumbersCard onChange={setScenario} />
          <ManualRun scenario={scenario} onRun={runManual} />
        </div>

        <Timeline
          entries={entries}
          outcome={outcome}
          running={running}
          replaying={replaying}
          question={question}
          notice={notice ? <span className="text-warn">{notice}</span> : null}
          selectedRunId={selectedId}
          onQuestion={setQuestion}
          onAsk={ask}
          onCancel={cancel}
          onReplay={startReplay}
          onShowAll={showAll}
          onSelectRun={selectRun}
          badge={badge}
          liveDisabledReason={LIVE_DISABLED_REASON ?? (scenario === null ? "Fix the numbers in Your numbers first." : null)}
        />

        <div className="xl:sticky xl:top-4">
          <Evidence runs={runs} selected={selected} compare={compare} selectedRun={selectedRun} compareRun={compareRun} onSelect={selectRun} onCompare={setCompareId} />
        </div>
      </main>

      <footer className="mt-6 border-t border-border pt-3 text-xs text-muted">
        Muse Spark drives the experiments through typed tools; the engine is the only source of numbers. Results describe this template model, not a real system.
      </footer>
    </div>
  );
}
