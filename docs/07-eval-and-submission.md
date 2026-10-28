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
| 1-6 | _not run_ | | | | |

Decision rule: if confirmed fixes are fewer than 3 of 6 while the engine is solid, reposition the agent as an optional explainer over a manual experiment lab (log in `decision-log.md`). The retry result is what the engine shows (D-016, D-017): more load and slower tail, not a higher error rate. Do not fake a different story.

## 3. Claim checker tests

A fabricated number is blocked; a matching number passes; a rounding mismatch is blocked; an unlisted numeric token is blocked; a knob value not in any recorded call is blocked. Result: _not run_.

## 4. Tester check (3 people, not friends or family if avoidable)

- Protocol written before testing: watch silently, no help, record where they stall.
- Questions: (1) what did the agent try first and what happened, (2) why did `retries=3` not help, (3) what is the cost of the working fix (the degraded responses).
- Bar: at least 2 of 3 answer (2) correctly unaided (it multiplied load and tail latency without lowering errors). Report the sample size; do not claim learning gains.

| Tester | Unaided | Explained retries result | Stalls |
| --- | --- | --- | --- |
| 1-3 | _not run_ | | |

## 5. Submission package

- [ ] README: video link first, then setup (`npm install`, optional `.env.local` with `META_API_KEY`, `npm run dev`), what works, what is replay, known limits, Meta model usage statement, architecture in one diagram, test results including misses.
- [ ] `.env.example` with placeholders only; `git log -p` checked for secrets.
- [ ] Golden run JSON committed so Replay mode works without a key.
- [ ] Clean-clone run from the README only, with and without a key.
- [ ] 3-minute video from real output; replay segments labeled.
- [ ] Submission text: problem in Afras's words, track (Indie Developer), Best Agentic Use-Case fit if the portal allows, limits.
- [ ] Portal rules rechecked (doc 02); submission opened as a judge would see it.

## 6. Cut order if behind

Evidence export, second scenario, tester count above 3, metrics panel polish. Never cut: the golden test, the claim checker, a live engine run, the Replay label.
