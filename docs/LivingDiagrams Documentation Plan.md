# LivingDiagrams Documentation Plan

Oct 27, 2026 · @Afras

Write 12 short documents in dependency order so an AI coding agent can build each part without guessing. The engine spec and its hand-computed test cases come first, because a wrong simulator makes everything after it worthless.

## Principles

An AI builder follows what is written and invents what is missing. These rules keep the invention out.

- **One document, one job.** Each file answers one question and stays under two pages, so an agent can load it whole.
- **Numbers, not adjectives.** Write "FIFO queue, capacity 20, reject with QUEUE\_FULL", not "a bounded queue".
- **Tests are documentation.** Every semantic rule in the engine spec has a hand-computed example that becomes a failing test before any code exists.
- **Name what is unsupported.** A feature that is not written down is disabled in the product, never silently approximated.
- **Decisions are logged.** When you change your mind, add a dated line to the decision log instead of editing history, so agents do not mix old and new rules.
- **Only work done from Oct 26 counts.** The rules say the demo must show only work built during the event, so do not reuse older code.

## The document set

Twelve documents cover the whole product. Documents 5 to 9 decide whether the product is trustworthy, so protect their time first.

| # | Document | What it settles | Feeds | Due | Done when |
| --- | --- | --- | --- | --- | --- |
| 1 | Product one-pager | Problem, user, MVP scope, Not Doing list | Every other document | Oct 28 | Fits one page; you can say it in 30 seconds |
| 2 | Rules, decisions and Day-1 spike | Official rules, deadline, Meta API tool-calling and image test results, decision log | Agent spec, UI scope | Oct 28 | Muse Spark tool-call test run 20 times and scored; image import go or no-go |
| 3 | AGENTS.md | Repo layout, coding rules, test commands, banned shortcuts | All AI coding sessions | Oct 28 | A fresh agent session builds a hello-world and runs its test |
| 4 | Scenario pack | The two demo topologies with exact numbers (outage, overload) | Engine tests, demo, pilot | Oct 28 | Every number in it is a stated assumption, labeled template |
| 5 | Engine semantics spec | Event order, queues, slots, failures, round-robin, metrics definitions | Engine code | Oct 28 | No rule says "should" without a number or an order |
| 6 | Golden test cases | 15 to 20 hand-computed cases with exact expected outputs | Engine tests | Oct 29 | You computed each answer by hand before any code exists |
| 7 | Data contracts | JSON schemas for model, run, event, claim, tool call | Engine, agent, UI | Oct 29 | Schemas validate the scenario pack with no edits |
| 8 | Agent spec | System prompt, tool list, state machine, budget, stop rules | Agent code | Oct 29 | Every tool has typed inputs, outputs and error codes |
| 9 | Evidence and claim-check spec | What counts as a supported claim, how numbers are verified | Claim checker, agent | Oct 30 | A fabricated number in a test is rejected |
| 10 | UI spec | Screens, states, card copy, accessibility, reduced motion | Front end | Oct 30 | Each screen lists loading, empty, error and failure states |
| 11 | Evaluation and pilot plan | Agent eval set, 5 to 10 classmate prediction test, scoring sheet | Impact slide, results | Oct 31 | Questions, scoring rule and sample size written before the test |
| 12 | Demo script and submission pack | 3-minute storyboard, README, setup, architecture, Meta-usage statement, limits | Video, repo, portal entry | Nov 3 | A stranger can run the project from the README alone |

## What the critical documents must contain

### Engine semantics spec (document 5)

- Event order at the same timestamp, as a numbered list: cancellations, then fault changes, then completions, then arrivals.
- For each node: concurrency, queue capacity, local time in whole milliseconds, and what happens when it is down.
- Round-robin routing: which target gets request 1, request 2, and what happens when the chosen target is down.
- Metric definitions with the denominator written out: success rate is successes divided by offered requests; outstanding requests at cutoff are counted separately, never as failures.
- A list of unsupported features (retries, parallel calls, cycles) and the error each returns.

### Golden test cases (document 6)

Each case lists the model, the arrivals, the fault, and the exact expected result. Examples to write by hand first:

- One API node, 10 ms local time, one request: latency is exactly 10 ms.
- API (10 ms) then database (50 ms), one request: latency is exactly 60 ms.
- Database with 1 slot and 50 ms, three requests at time 0: finishing at 50 ms and 100 ms, and the third waits or is rejected depending on queue capacity.
- Database down from 4,000 to 6,000 ms: every request that needs it in that window fails with COMPONENT\_DOWN, with 2 or 3 API replicas alike.
- Overload: database ceiling is 1 divided by 0.05 = 20 operations per second against 40 offered, so the queue must fill.

### Agent spec (document 8)

- The state machine from the spec: draft, needs input, ready, running, analyzing, proposing, comparing, complete, plus cancelled and failed.
- Each typed tool with exact arguments, return shape and error codes, and the rule that the model never sees raw events, only metric summaries and selected traces.
- Budget: maximum experiments, simulated horizon, and what needs a user click to extend.
- Stop rules, and the required final structure: claim, evidence run IDs, rejected proposals, limits.
- A test list of questions the agent must refuse or ask about: missing database time, impossible budget, an unsupported feature.

### UI spec (document 10)

- Four screens only: project home, model workspace, investigation view with replay, comparison view.
- The prediction prompt that appears before any run, and the card copy for question, finding, limit and recovery.
- Every state: loading, empty, invalid model, failed run, cancelled run, provider down (replay labeled as replay).
- Keyboard use, text labels with colors, reduced-motion option.

### Demo script (document 12)

A second-by-second storyboard for 3 minutes: the student's wrong prediction in the first 20 seconds, the failed fix, the overload surprise, the classmate result, and one closing line about developers. Mark every shot that uses a recorded replay.

## Eight-day schedule

The official deadline is 9 PM ET on Nov 4 (early morning Nov 5 in Sri Lanka, sources differ by an hour). Plan to submit on the evening of Nov 4 Sri Lanka time and treat the rest as buffer. Documents lead building by about half a day.

| Day | Write | Build | Gate to pass before moving on |
| --- | --- | --- | --- |
| Oct 28 | Documents 1 to 5 | Repo scaffold, Meta API tool-calling and image test | Tool-call test scored; engine spec frozen |
| Oct 29 | Documents 6 to 8 | Engine until all golden tests pass | Every golden test is green |
| Oct 30 | Documents 9 and 10 | Agent loop, tool layer, claim checker | Agent runs the outage investigation end to end with no invented number |
| Oct 31 | Document 11 | Model workspace, investigation view, replay | A fresh person completes a first experiment without help |
| Nov 1 | Update 4 and 10 if needed | Comparison view, failed-fix flow, overload scenario, classmate pilot starts | Both demo beats work live |
| Nov 2 | Pilot results into document 11 | Error states, provider-down fallback, evidence export | No failing invariant; feature freeze at end of day |
| Nov 3 | Document 12 final | README, setup check, record the 3-minute video | Public repo, working link, video recorded |
| Nov 4 | Fix only | Re-record if needed, submit in the portal | Submitted hours before the cutoff |

## Rules for the AI builder

Put these in AGENTS.md (document 3) so every coding session starts with the same constraints.

1. Read the engine spec and golden tests before touching engine code. Write the failing test first.
2. The engine is plain TypeScript with no network calls and no model calls. It never imports the agent package.
3. The agent can only act through typed tools. An unknown tool name or argument is rejected, not guessed.
4. A numeric claim in agent output must match a recorded metric path. Anything else is blocked, not shown.
5. Never hardcode an expected result into the product or the demo. Prerecorded runs carry a visible replay label.
6. An unsupported feature is disabled in the interface, never accepted and ignored.
7. The Meta API key stays on the server. The browser never sees it.
8. Send the model metric summaries and selected traces, never the full event stream.
9. One task per session, one document loaded for it, and a commit when its tests pass.
10. If the spec is silent, stop and add a question to the decision log instead of choosing.

## Cut list and open items

### Do not write documentation for

- Retries, queues and workers, deadlines, and the retry storm scenario.
- Accounts, sharing, collaboration and server-side scoring.
- Diagram import from files, and calibration against real measurements.
- Stochastic workloads: use fixed persisted arrival traces.
- Sketch import, unless the Day-1 test shows Muse Spark accepts images. Decide on Oct 28 and log it.

### Confirm in the event portal

- [ ] Final submission cutoff in your time zone and the required video length.
- [ ] Judging weights: one source says all four criteria are equal, your screenshots say 30, 25, 25, 20.
- [ ] Which Meta models count: Muse Spark through the Meta Model API, or open-weights models too.
- [ ] License requirement for the public repo, and how "work done during the event" is checked.
- [ ] Whether tool calling is supported on the model you pick, and the credit limit before charges start.
- [ ] Who can be named on the entry (you are solo, so confirm one representative).
