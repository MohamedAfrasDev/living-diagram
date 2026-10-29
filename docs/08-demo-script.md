# Demo Script (3 minutes)

The guide asks for a three-minute video that shows what was built during the hackathon, and says judges use it with the code. This script is built from the **real recorded run** (`public/golden/slow-payment-run-1.json`, recorded 2026-10-29, 7 simulations, 3 checked claims, 1 live blocked statement). Every figure below was read from that file. Do not rehearse numbers from memory: read them off the screen.

Two blanks are yours and are marked **[YOURS]**: the opening story and the tester result. Do not invent either.

## Before recording

- Record from a **production build** (`npm run build`, then `npm start`), not `npm run dev`: dev mode shows a Next.js indicator in the corner. Use a clean browser profile, dark theme, window about 1440 x 900, page zoom 110%.
- Start in Replay (no key needed). The amber **Replay** banner and the green "Replay verified against the live engine" badge must be visible when the replay is on screen. That is the honest label, not clutter.
- Reload so the run opens on `run-3` against `run-2`. Close other tabs and notifications.
- Optional, only if you have a key and want to show the live agent: one short clip at the end of section 2 (see "Live clip"). A live run varies, so narrate what the screen shows and do not read the script over it.
- Record voice separately if you can, then lay it over the screen capture.

## Timeline

| Time | On screen | What you do |
|---|---|---|
| 0:00 to 0:20 | The workspace, Replay banner and "verified" badge visible | Say your opening story **[YOURS]** |
| 0:20 to 0:50 | System pane at the fault; Evidence pane showing `run-2` | Show the question; point at the badge; read the healthy and fault numbers |
| 0:50 to 1:40 | Click the `run-3` card; canvas plays; Evidence compares `run-3` with `run-2` | Breaker result, then the degraded share; then `run-4`, `run-5`, `run-6` |
| 1:40 to 2:20 | `run-7` card; scroll to the red **Blocked** card; then the Conclusion and Limits | Retries rejected with numbers; the blocked statement; the conclusion |
| 2:20 to 2:45 | README results table or the docs; one title card | Real results, misses included **[YOURS: tester result]** |
| 2:45 to 3:00 | The workspace again | Limits, Meta models, built during the hackathon |

## Voiceover

> **0:00.** **[YOURS: one or two sentences, in your own words: the real moment that made you build this. Shape: what you changed, what you could not tell, why a chatbot's confident answer was not enough.]** So I built an agent that answers that question with experiments, and is not allowed to state a number the simulator did not record.

> **0:20.** This is LivingDiagrams. A checkout path of five services, and Payment has become twenty times slower. I ask: checkout is failing because payment is slow, find a fix and show me the evidence. This is a recorded session with Muse Spark, labeled Replay at the top. Before it is shown, every step is re-run on the live simulator, and this badge means every result matched. Healthy, no requests fail. With the fault, 94 percent fail.

> **0:50.** Nobody scripted what happens next. The agent reads the metrics and tries a circuit breaker. Errors drop from 94 percent to 16 percent. But look beside it: 65.6 percent of requests are now served degraded. The breaker did not fix Payment. It chose which failures users see. You can watch Payment go quiet on the canvas once the breaker opens. Then the agent checks itself: a second seed, 94 down to 16.2 percent, and the healthy system with the breaker on, no errors and nothing degraded.

> **1:40.** It also tests the obvious alternative, retries. They multiply the load on Payment, nearly three attempts per request and a p95 over two and a half seconds, and errors barely move, 91 percent. The agent rejects them, with those numbers. When it wrote its conclusion, the checker blocked one statement, because it had spelled a number as a word, and a word can not be traced to a metric. The agent fixed it and resubmitted. Nothing it says reaches you unless every number matches a recorded value, and the limits are stated next to the conclusion.

> **2:20.** Here is how it really performed. In twelve live runs it confirmed a fix in eight: three of six the first time, which missed my bar, and five of six after one clarifying sentence in the prompt. No unsupported number got through. It never tried a wrong fix first on its own, so I am not claiming it self-corrects. **[YOURS: tester result, for example "Of three people who had not seen it, X could explain why retries did not help." Use the real number, and say it is three people.]**

> **2:45.** Muse Spark drives the experiments through typed tools. The simulator is deterministic code and the only source of numbers. It models a template system, so it does not predict your real capacity, but it shows how to ask "did this fix help?" and get evidence. The engine, agent, interface and tests were all built during the hackathon.

Length: 397 spoken words without your two blanks (about 2:40 at 150 words a minute); your two blanks add roughly 20 seconds, so it lands very close to 3:00. Read it aloud once with a timer. If it runs over, **cut, do not speed up**, in this order: (1) "You can watch Payment go quiet on the canvas once the breaker opens." (2) "and the limits are stated next to the conclusion" (3) the last sentence of the 2:45 paragraph's first half, "It models a template system... real capacity," only if the Limits card stays on screen. Never cut the Replay label, the degraded share, the blocked statement or the misses.

## Live clip (optional, 20 to 30 seconds)

Only with a key, on the local machine, not on a hosted copy. Click **Ask the agent** on the default question and show the badge switch to **Live agent**, the Replay banner disappear, and steps stream in. Say what you see: "This is a fresh run by Muse Spark." Cut away before it finishes, or show the final status. If the live run takes a different path or hits a provider error, say so plainly. Never present the recording as the live run, and never present the live run as the recording.

## What not to say

- Not "the first" or "the only" tool, and nothing about real-world capacity, throughput or cost. The model is a template with virtual time.
- Not that retries "make errors worse". In this model they do not raise the error rate (D-016); they multiply load and tail latency.
- Not that the agent "learned", "self-corrected" or "reasoned its way past a wrong fix". It did not try a wrong fix first (0 of 12).
- Not "it always finds the fix". It confirmed 8 of 12 runs; the misses are in the README.
- Not any tester statement beyond the real count and the sample size of three.

## Required on screen

- The **Replay** banner whenever the recording is shown, and the **Live agent** badge when a live run is shown.
- The "Replay verified against the live engine" badge at least once, held for two seconds.
- A text overlay near the end: "Built during the hackathon: engine, agent, interface, tests. Only the Next.js scaffold predates it."
- The Limits card in view for at least three seconds.

## After recording

- Check the length is at most 3:00 and the voice is clear at normal speed; check the numbers you read against the screen.
- Watch it once as a stranger would: is every claim visible on screen? Does anything look like the recording is live?
- Upload, set the link to public or unlisted, open it logged out, and put the link in the README and the submission.
- Post the video on X and submit that link on the platform if you want to enter Most Viral (engagement counts until Nov 8 EOD).
