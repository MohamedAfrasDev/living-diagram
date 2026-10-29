# UI and Demo Spec

One screen, no accounts, no authoring. The UI shows the system, the agent's investigation and the evidence together. Animation is a replay of engine events, never a separate source of numbers.

## 1. Layout

| Pane | Content |
| --- | --- |
| Left: canvas | Five fixed nodes and their edges. Per-node queue depth and occupied slots animate from engine events. Failed requests are marked with a text label, not color alone |
| Center: agent timeline | Question box and Investigate button. Each tool call and result as a card; the knob change proposed; blocked claims shown with their reason |
| Right: evidence | Run selector, before and after metrics (`errorRate`, `degradedRate`, `outstanding`, p95, `paymentAttemptsPerRequest`), run IDs, seed, engine version |

## 2. Required labels

- **Replay:** a persistent label on anything not freshly executed by the live agent.
- **Template assumptions:** the scenario numbers are labeled as assumptions near consequential conclusions.
- **Degraded:** the circuit-breaker fix always shows its `degraded` count beside `errorRate`.
- **Scope:** "This models the configured template, not your system's real capacity."

## 3. States (every one reachable and designed)

Empty (before investigating), running, paused after current tool, cancelled, agent unavailable (manual simulation still works), invalid tool call, budget exceeded, run incomplete (`RUN_INCOMPLETE`, not ranked), comparison mismatch, claim blocked.

## 4. Controls

- Investigate, pause after current tool, cancel.
- Manual mode: set the four knobs by hand and run the simulator. This must work when the provider is down.
- Run selector and request selector (click a request to open its per-hop trace).
- Disabled, not hidden: anything unsupported is shown disabled with a reason.

## 5. Accessibility minimum

Keyboard reachable controls, text labels on outcomes, a reduced-motion setting that stops canvas animation and shows a table of node metrics instead, visible focus.

## 6. Demo video (3 minutes, real output; replay segments labeled)

| Time | Content |
| --- | --- |
| 0:00-0:20 | The firsthand problem in the first sentence |
| 0:20-0:50 | The question typed in; baseline passes; the fault makes checkout fail; metrics shown |
| 0:50-1:40 | The agent tries `retries=3`; the engine shows it multiplies Payment attempts and stretches p95 latency without lowering errors; the agent explains from those metrics |
| 1:40-2:20 | The agent verifies `circuitBreaker` with `retries=0` on two seeds and the no-fault baseline; shows `errorRate` beside the large `degraded` share (the tradeoff); one blocked claim |
| 2:20-2:45 | Real results: golden test, agent runs with misses, tester note with the sample size |
| 2:45-3:00 | Limits (template model, not real capacity) and which Meta model does what |

## 7. Out of scope here

Project home, saved projects, authoring, onboarding, settings, charts beyond the metric table, hosting.

## 8. Implementation notes (T15 to T17)

Built in `app/_components/` (`Workspace`, `Canvas`, `Playback`, `Timeline`, `Evidence`, `ManualRun`) with pure helpers in `lib/ui/`.

- **System pane:** a canvas of the five nodes with busy-slot and queue gauges, a "FULL" text label when a gauge is saturated, the breaker state and a "20x slower" tag. It draws one sample of the engine's own occupancy timeline (`recordTimeline`, every 50 ms of virtual time, not part of the run hash), plus play, pause, restart, speed and a time slider. A "Show node state as a table" alternative opens by default under reduced motion, and reduced motion also disables autoplay and stepped replay.
- **Agent pane:** question box, "Ask the agent" (live, streamed from `/api/agent`), "Replay recorded run" (stepwise, with "Show all"), a card per tool call and result (rejected calls shown with their error code), blocked statements as a red "Blocked: not shown as a conclusion" card with the reasons, and the final conclusion with rejected proposals and a Limits card.
- **Evidence pane:** run selector and "Compare with" selector, knob and fault chips, a metric table with changes marked by arrows and the words "better" or "worse" (so colour is not the only signal), error rate and degraded rate adjacent, per-node detail, a scope card and the run hash. Runs that differ in seed or fault show "Not comparable" and no deltas.
- **Manual mode:** the four knobs, the fault toggle and a seed, run on the same engine in the browser. Invalid values disable the button and say why. Works without a key.
- **Replay:** the golden file is fetched and verified before anything is shown; a persistent amber "Replay" banner and badge mark it; a failed verification shows a red alert and hides the recording. With no API key, "Ask the agent" shows a notice and falls back to Replay.
- **Checked in a browser (Chrome pane):** replay verified and autoplayed, stepwise replay and "Show all", a manual run compared with the baseline, one live agent run streamed to completion, the no-key fallback on a production build, and a 375 px phone viewport with no horizontal overflow. `npm run build` passes (`/` static, `/api/agent` dynamic).
- **Not yet done:** an automated browser test, keyboard-only pass, light-theme visual check, README and `.env.example` (T18).
