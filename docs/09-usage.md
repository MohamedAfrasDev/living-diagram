# Usage Guide

Every way to use LivingDiagrams, from a first run to re-recording the replay. The numbers in section 4 were produced by running the engine on 2026-10-29 with seed 1 (500 requests at 50 per second, the template numbers). The tests pin the relationships in D-017, not these exact values, so if the engine or the scenario changes, re-run them.

## 0. Start it

```bash
npm install
npm run dev
```

Open http://localhost:3000. For the live agent, put `MODEL_API_KEY=<your key>` in `.env.local` first (copy `.env.example`). The key stays on the server and never reaches the browser.

If port 3000 is already taken, Next.js refuses a second dev server in the same folder, so stop the old one first. After you change styles or pull new code, restart `npm run dev`: a stale dev server can keep serving an old stylesheet (D-036).

## 1. What the screen is

| Pane | What it is |
|---|---|
| **System** (left) | Five nodes: Gateway, Order, Cache, Payment, DB. Gauges show busy slots and queue depth from the engine's own run. "FULL" marks a saturated gauge. Play, pause, speed, a time slider, and a table alternative |
| **Agent investigation** (middle) | The question box and every step the agent took, with blocked statements and the final conclusion with its limits |
| **Evidence** (right) | The metrics of the selected run, optionally compared with another run |
| **Run it by hand** (below the system) | The four knobs, run on the same engine, no agent or key needed |

Two rules for reading it: **degraded is not an error but it is not a full success either**, so always read error rate and degraded rate together. And all numbers describe a template model with virtual time, not your real system.

## 2. Watch the recorded investigation (no key needed)

1. The page opens on the recorded Muse Spark session, under an amber **Replay** banner. The green badge "Replay verified against the live engine · 20 calls re-run" means every recorded step was re-run on today's engine and matched.
2. The canvas autoplays the run the agent tried first (`run-3`, the circuit breaker) against the fault alone. With reduced motion enabled it does not autoplay.
3. Click **Replay recorded run** to step through the whole investigation one entry at a time, then **Show all** to skip ahead.
4. Click any `simulate` card to load that run into the canvas and the evidence panel.

## 3. Compare any two runs

In the Evidence pane use **Run** and **Compare with**. You get both values and the change, marked with an arrow and the word "better" or "worse". Runs with a different seed or fault show **Not comparable** and no deltas, because only knob values may differ between compared runs. "Per-node detail" shows slot occupancy, queue and rejections.

## 4. Run your own experiments by hand

In **Run it by hand** set the knobs, tick or untick the fault, pick a seed, and press **Run simulation**. Invalid values disable the button and say why. Each run appears as `manual-1`, `manual-2` and so on. When a baseline run with the same seed and fault already exists in the list, the new run is compared with it automatically.

What the engine gives for each setting (template numbers):

| Experiment | Errors | Degraded | Payment attempts per request | p95 |
|---|---|---|---|---|
| Healthy, defaults | 0.0% | 0.0% | 1.00 | 48 ms |
| **Fault**, defaults | 94.0% | 0.0% | 1.00 | 838 ms |
| Fault + `retries 1` | 91.2% | 0.0% | 1.94 | 2,028 ms |
| Fault + `retries 3` | 91.8% | 0.0% | 3.80 | 2,968 ms |
| Fault + `retries 5` | 91.2% | 0.0% | 5.65 | 3,248 ms |
| Fault + circuit breaker | 16.0% | 65.6% | 0.34 | 848 ms |
| Fault + breaker + `retries 2` | 0.8% | 80.8% | 0.36 | 848 ms |
| Fault + `bulkhead 5` | 76.0% | 0.0% | 0.24 | 428 ms |
| Fault + `bulkhead 10` | 52.0% | 0.0% | 0.48 | 428 ms |
| Fault + `timeoutMs 300` | 100.0% | 0.0% | 1.00 | n/a |
| Fault + `timeoutMs 3000` | 46.4% | 0.0% | 1.00 | 1,238 ms |
| Healthy + breaker | 0.0% | 0.0% | 1.00 | 48 ms |

What it teaches:

- **Retries do not fix this fault.** They barely move errors and multiply load and tail latency.
- **The breaker trades errors for degraded responses.** More retries behind it recover more requests but degrade more.
- **There is no single "best" setting.** A longer timeout gives the lowest plain error rate here (46.4%), and the breaker is the only one that passes the project's confirmation rule (errors cut to at most half, degraded share reported, healthy system untouched; D-017).
- **Observed behavior:** breaker plus bulkhead 5 behaves like bulkhead 5 alone (76.0%), because the breaker counts failed Payment attempts and the bulkhead rejects before an attempt exists, so the breaker never opens.

Use the same seed to compare. A different seed only changes which requests miss the cache.

## 4b. Your numbers: use your own capacities and timings

The **Your numbers** card (under the System pane, collapsed, marked Template or Custom) lets you enter your own numbers for the same five services: workers, queue size and milliseconds per request for each, a request every N ms (5 to 100 requests per second), the cache miss percent, and how many times slower Payment is when the fault is on (2 to 50).

- Bounds are 1 to 500 workers, 0 to 500 queue, 1 to 2,000 ms. An out-of-range or blank entry is an error that states the bounds; nothing is corrected silently, and "Run simulation" and "Ask the agent" stay disabled, with the reason shown, until the numbers are valid.
- Manual runs use the current numbers and carry a "Custom numbers" chip. The canvas gauges and the evidence panel use the numbers each run was made on. Changing the card never rewrites existing runs.
- Runs on different numbers are **not comparable**: the comparison shows that and no deltas.
- **Ask the agent** sends your numbers; the agent is told they are your inputs, not measurements, and to say so when the healthy system already fails. It can still change only the four settings.
- The recorded Replay always uses the template numbers. **Reset to template** restores them.
- Example (seed 1, fault on): doubling Payment's workers from 10 to 20 takes the error rate from 94.0% to 0.0%, with every request succeeding (p95 648 ms).
- These are numbers you entered on a simplified model. They are not measurements, and you still cannot add or rewire services.

## 5. Ask the live agent (needs a key)

1. Type a question (up to 500 characters) and press **Ask the agent**. The badge switches to **Live agent** and the Replay banner disappears. A run takes roughly 30 to 90 seconds. **Cancel** stops it.
2. Questions that work well:
   - "Checkout is failing because payment is slow. Find a fix and show me the evidence."
   - "Should I turn on a circuit breaker, add a bulkhead, or tune the timeout? Evaluate and recommend."
   - "I suspect adding retries will help. Test that idea." This usually ends with "insufficient evidence" and retries rejected, which is an honest answer, not a failure.
   - "Do not assume anything: find out why, and whether a config change can fix it, or tell me honestly if you cannot."
3. The agent assumes the default settings (timeout 1000, retries 0, breaker off, bulkhead off) unless you state your current ones. Say so in the question if yours differ.
4. It has a budget of 8 simulations and 24 tool calls, and only one investigation can run at a time (a second one is refused as busy).
5. Final statuses you can see:

| Status | Meaning |
|---|---|
| Complete | Claims checked, a fix was confirmed |
| Insufficient evidence | No fix confirmed; the limits say why |
| Stopped: no conclusion within the turn budget | It ran out of turns |
| Agent unavailable | The provider failed after retries |
| Stopped: the model did not use the tools | The model answered in plain text twice |
| Cancelled | You cancelled it |

6. A red **Blocked** card means the claim checker stopped a statement: a number did not match a recorded metric, a number was spelled as a word, or causal wording had no recorded comparison. The agent sees the reasons, fixes it and resubmits.
7. Runs differ. In one run it tested retries as a counterexample, in another it did not, and it picks its own seeds.

## 6. When something is missing or fails

| You see | Meaning and what to do |
|---|---|
| Notice: "The live agent is unavailable on this server (no API key is configured)" | No `MODEL_API_KEY`. It falls back to Replay. Add the key and restart |
| "Another investigation is already running" | Wait for the first to finish |
| "Agent unavailable: the model provider failed" | Meta's API failed after 3 retries. Try again; the manual simulator still works |
| Red alert: "The recorded replay failed verification (CODE)" | The recording no longer matches the engine or was edited. It is hidden on purpose. `ENGINE_VERSION_MISMATCH` means the engine version changed and the golden run must be re-recorded; `HASH_MISMATCH` means the file was altered; `REPLAY_MISMATCH` means a recorded step no longer reproduces |
| Black boxes, no colors | Stale dev server: stop and restart `npm run dev`, then hard-refresh (Ctrl+Shift+R) |

## 7. Reviewers and judges

No key needed: `git clone`, `npm install`, `npm run dev`, open localhost:3000. They see the verified Replay, the simulator and manual mode. With their own key they can ask the agent too. The hosted replay copy (when deployed) shows "Ask the agent" **disabled with a reason**, and the server refuses requests even if a key were present (D-033).

## 8. Developers

| Task | How |
|---|---|
| Run all tests | `npm test` (119) |
| Production run | `npm run build`, then `npm start` |
| Re-run the agent evaluation (costs a few cents) | with the server running: `node scripts/agent-test.mjs http://localhost:3000 <trial-name>`; outputs go to `data/runs/<trial-name>/` |
| Re-run the tool-calling check | `node scripts/spike-tool-calling.mjs` with `MODEL_API_KEY` set |
| Record a new Replay | capture a live run with `curl -N -X POST localhost:3000/api/agent -H "Content-Type: application/json" -d '{"question":"..."}' > run.ndjson`, then `node scripts/build-golden.mjs run.ndjson public/golden/<name>.json "<note>"`, and point `GOLDEN_URL` in `app/_components/Workspace.tsx` at it. Never import the JSON through the bundler: it corrupts floats (D-030) |
| Change the engine | write the failing test first. If a change alters any recorded result or the engine version, the Replay fails verification until it is re-recorded |
| Specs and decisions | `docs/01` to `docs/09` and `docs/decision-log.md` |

## 9. Recording the video and testing people

Follow `docs/08-demo-script.md` (record from a production build so the Next.js dev indicator is not on screen) and `docs/07-eval-and-submission.md` section 4 for the three-person tester check.

## 10. What it will not do

It models one fixed chain of five services with one fault. You can enter your own numbers for those services, but it cannot analyze your own architecture (you cannot add, remove or rewire services) or predict real capacity. There are no accounts, no database, no image import and no other faults. A hosted copy never runs the live agent.
