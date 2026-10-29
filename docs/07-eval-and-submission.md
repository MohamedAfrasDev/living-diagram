# Evaluation and Submission

Write bars before running anything. Fill result tables with real numbers only; "not run" until measured. Misses are reported.

## 1. Engine gate (before any UI)

The five golden tests in doc 05 plus invariants pass. Result: _not run_.

## 2. Agent test (6 runs, different seeds and phrasings)

| Metric | Bar |
| --- | --- |
| Valid tool calls only (no unrecoverable rejection) | at least 5 of 6 runs |
| Ends on an engine-confirmed fix (`errorRate` at most half of fault-alone on two seeds, `degradedRate` reported, baseline undegraded; D-017) | at least 4 of 6 |
| Self-corrects after a wrong first fix | reported, no bar |
| Unsupported numeric claims shown to the user | 0 |

| Run | Valid calls | Confirmed fix | Self-corrected | Blocked claims | Notes |
| --- | --- | --- | --- | --- | --- |
| 1 | yes | yes (breaker, retries 0; seeds 1 and 2; healthy undegraded; degraded reported) | no | 0 | "Find a fix and show me the evidence" |
| 2 | yes | yes (same fix) | no | 1 (a limit contained "two"; fixed on the next call) | "Which setting change would you make?" |
| 3 | yes | no: concluded insufficient evidence | no | 0 | "I suspect retries will help. Test that idea": retries did not help, rejected with numbers |
| 4 | yes | **no by the pre-registered scorer**; the agent used retries=2 as its own baseline, and breaker on top cut errorRate by more than half on both seeds | no | 0 | "Circuit breaker, bulkhead or timeout?" |
| 5 | yes | **no by the pre-registered scorer**; same pattern as run 4 | no | 0 | "What is safe to change?" |
| 6 | yes | yes (breaker, retries 0) | no | 0 | "Do not assume anything" |

**Trial 1 result (2026-10-29, `scripts/agent-test.mjs`, transcripts in `data/runs/`): valid calls 6 of 6 (bar 5: met). Confirmed fix 3 of 6 (bar 4: MISSED). Unsupported numbers 0, and 0 unverifiable in the transcripts (bar 0: met). Self-corrected 0 of 6. Blocked statements 1.** The scorer was fixed before the run and checked on the exploratory transcript first. Observations: (a) in runs 4 and 5 the agent assumed `retries=2` as the current setting, which the user never stated; its claims said so, and against that baseline the breaker fix halves errorRate on two seeds, so a relaxed scorer ("baseline = same knobs without the fix") would give 5 of 6, but that is a post-hoc reading and is not the headline; (b) run 3's prompt asked for a test of one idea, not for a fix; (c) the agent always chose seeds 1 and 2, so seeds were not varied; (d) it never tried a wrong fix first except when the user suggested retries (run 3), so there was no self-correction; (e) with `retries=2` kept, the breaker reached errorRate about 0.01 with a degraded share near 0.81, versus 0.16 and about 0.66 with `retries=0`: more recovered requests but more degraded ones. The decision rule (fewer than 3 of 6 means reposition) is not triggered.

**Trial 2 (2026-10-29, after one sentence was added to the system prompt defining the default baseline: timeoutMs 1000, retries 0, breaker off, bulkhead null; same six prompts, same scorer; transcripts in `data/runs/trial2/`): valid calls 6 of 6 (bar 5: met). Confirmed fix 5 of 6 (bar 4: met). Unsupported numbers 0 (bar 0: met). Self-corrected 0 of 6. Blocked statements 2 (both in run 3: the word "half" in a rejected proposal; fixed on the next call).** Runs 1, 2, 4, 5 and 6 all ended on `circuitBreaker` with `retries=0`, verified on seeds 1 and 2 with the healthy system undegraded and the degraded rate reported. Run 3 again tested only the user's retries idea, rejected it with recorded numbers, and concluded insufficient evidence. **Both trials are reported; trial 2 is the result with the clarified prompt, not a replacement for trial 1.** The prompt change was made after seeing trial 1 (D-027), the scorer was not changed, and the agent again chose only seeds 1 and 2 and never tried a wrong fix first, so "self-corrects" is 0 of 12 across both trials.

Exploratory run before the formal test (2026-10-29, live through `/api/agent`, not counted in the six): status `complete`, 14 turns, 7 simulations, 18 tool calls. The agent ran healthy and fault baselines, tried `circuitBreaker` first, verified it on a second seed and on the healthy system, then tested `retries=2` as a counterexample and rejected it with recorded numbers (errorRate close to the fault alone, about 3 attempts per request, slower tail). Its first `conclude` was blocked by the checker ("two" written as a word in a limit) and it fixed it on the next call. Every number in the three accepted claims matched a recorded metric. It did **not** try a wrong fix first, so the "self-corrects" column may stay empty; the video must show what the agent really does. Log saved as `data/golden/candidate-live-run-1.ndjson`.

Decision rule: if confirmed fixes are fewer than 3 of 6 while the engine is solid, reposition the agent as an optional explainer over a manual experiment lab (log in `decision-log.md`). The retry result is what the engine shows (D-016, D-017): more load and slower tail, not a higher error rate. Do not fake a different story.

## 3. Claim checker tests

A fabricated number is blocked; a matching number passes; a rounding mismatch is blocked; an unlisted numeric token is blocked; a knob value not in any recorded call is blocked. Result (2026-10-29): 22 tests pass in `lib/agent/claims.test.ts`, covering each case above plus ratio, difference, seed, causal-wording and error-rate-direction cases. Full suite: 74 of 74.

## 4. Tester check (3 people, not friends or family if avoidable)

- Protocol written before testing: watch silently, no help, record where they stall.
- Questions: (1) what did the agent try first and what happened, (2) why did `retries=3` not help, (3) what is the cost of the working fix (the degraded responses).
- Bar: at least 2 of 3 answer (2) correctly unaided (it multiplied load and tail latency without lowering errors). Report the sample size; do not claim learning gains.

| Tester | Unaided | Explained retries result | Stalls |
| --- | --- | --- | --- |
| 1-3 | _not run_ | | |

## 5. Submission package

- [ ] README: video link first, then setup (`npm install`, optional `.env.local` with `MODEL_API_KEY`, `npm run dev`), what works, what is replay, known limits, Meta model usage statement, architecture in one diagram, test results including misses.
- [ ] `.env.example` with placeholders only; `git log -p` checked for secrets.
- [ ] Golden run JSON committed so Replay mode works without a key.
- [ ] Clean-clone run from the README only, with and without a key.
- [ ] 3-minute video from real output; replay segments labeled.
- [ ] Submission text: problem in Afras's words, track (Indie Developer), Best Agentic Use-Case fit if the portal allows, limits.
- [ ] Repo is public; video link works logged out; everyone who worked on it is listed.
- [ ] README has a "Built during the hackathon" section: what is new (engine, agent, UI, tests, docs) and the create-next-app boilerplate disclosed.
- [ ] Optional: X post with the demo, link submitted on the platform (Most Viral, counts until Nov 8 EOD).
- [ ] Accepted (D-020): replay-only hosted build as a convenience link, with no Meta key on the server.
- [ ] Meta API credits claimed with the form before Nov 4, 9 PM ET, spend limit set.
- [ ] Portal rules rechecked (doc 02); submission opened as a judge would see it.

## 6. Cut order if behind

Evidence export, second scenario, tester count above 3, metrics panel polish. Never cut: the golden test, the claim checker, a live engine run, the Replay label.
