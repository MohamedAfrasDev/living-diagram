# Task List: LivingDiagrams

See `tasks/plan.md` for architecture, dependencies and risks. Sizes: XS/S/M. Docs go in `docs/`.

## Phase 0: Foundations (Oct 28)

### Task 1: Product one-pager (doc 1)
**Description:** Problem, user, MVP scope, Not Doing list.
- [ ] Fits one page; sayable in 30 seconds
- [ ] Not Doing list matches the plan's cut list
**Verification:** Read aloud in under 30 s.
**Dependencies:** None | **Files:** `docs/01-product-one-pager.md` | **Scope:** XS

### Task 2: Rules, decision log, Day-1 spike (doc 2)
**Description:** Confirm portal items, create decision log, test Meta API tool calling and image input.
- [ ] Portal checklist answered (cutoff, weights, models, license, credits, entrant)
- [ ] Tool-call test run 20 times and scored
- [ ] Image import go/no-go logged with date
**Verification:** Scored results table in doc; log entry exists.
**Dependencies:** None | **Files:** `docs/02-rules-and-spike.md`, `docs/decision-log.md`, spike script (scratch) | **Scope:** M

### Task 3: AGENTS.md + repo scaffold (doc 3)
**Description:** Add the 10 builder rules, repo layout, test commands to the existing `AGENTS.md` (keep the Next.js warning block), add a test runner (e.g. vitest) and a hello-world test.
- [ ] Rules 1-10 from the source doc present
- [ ] `npm test` runs and passes a hello-world test
- [ ] `npm run build` succeeds
**Verification:** Fresh agent session builds and runs the test.
**Dependencies:** T1 | **Files:** `AGENTS.md`, `package.json`, `lib/hello.ts`, `lib/hello.test.ts` | **Scope:** S

### Task 4: Scenario pack (doc 4)
**Description:** Two topologies (outage, overload) with exact numbers, labeled template assumptions.
- [ ] Every number is a stated assumption
- [ ] Fixed arrival traces specified (no randomness)
**Verification:** Review for unlabeled numbers.
**Dependencies:** T1 | **Files:** `docs/04-scenario-pack.md` | **Scope:** S

### Task 5: Engine semantics spec (doc 5)
**Description:** Event order, node params, round-robin, metric denominators, unsupported-feature errors.
- [ ] No "should" without a number or order
- [ ] Same-timestamp order: cancellations, faults, completions, arrivals
- [ ] Success rate = successes / offered; outstanding counted separately
**Verification:** Search doc for "should"/"may"; none ambiguous.
**Dependencies:** T4 | **Files:** `docs/05-engine-semantics.md` | **Scope:** M

### Checkpoint: Specs frozen
- [ ] Tool-call scored; image decision logged; engine spec frozen; hello-world green in fresh session

## Phase 1: Engine (Oct 29)

### Task 6: Golden test cases (doc 6)
**Description:** 15-20 hand-computed cases (model, arrivals, fault, exact result), including the five examples in the source doc.
- [ ] Each answer computed by hand before code
- [ ] Covers latency 10/60 ms, 1-slot DB 50/100 ms, outage 4000-6000 ms with 2 and 3 replicas, overload 20 vs 40 ops/s
**Verification:** Second hand-check of 3 random cases.
**Dependencies:** T5 | **Files:** `docs/06-golden-tests.md` | **Scope:** M

### Task 7: Data contracts (doc 7)
**Description:** JSON schemas for model, run, event, claim, tool call; matching TS types.
- [ ] Scenario pack validates against schemas unedited
- [ ] Schema validation test passes
**Verification:** `npm test` schema test.
**Dependencies:** T4, T5 | **Files:** `docs/07-data-contracts.md`, `lib/contracts/*.ts`, test | **Scope:** M

### Task 8: Agent spec (doc 8)
**Description:** Prompt, tools with typed I/O and error codes, state machine, budget, stop rules, refusal test list.
- [ ] Every tool has typed inputs, outputs, error codes
- [ ] Final structure: claim, evidence run IDs, rejected proposals, limits
**Verification:** Review checklist.
**Dependencies:** T7 | **Files:** `docs/08-agent-spec.md` | **Scope:** M

### Task 9: Engine core - serial chain
**Description:** Event loop, integer-ms time, node local time. Golden 1-2.
- [ ] Single node latency exactly 10 ms; API+DB exactly 60 ms
**Verification:** Failing test first, then green.
**Dependencies:** T6, T7 | **Files:** `lib/engine/*.ts`, tests | **Scope:** M

### Task 10: Engine - slots, queues, rejection
**Description:** Concurrency, FIFO queue (capacity per spec), QUEUE_FULL.
- [ ] 3 requests at t=0 on 1-slot 50 ms DB match golden 3
**Verification:** Golden test green.
**Dependencies:** T9 | **Files:** engine + tests | **Scope:** S

### Task 11: Engine - faults and round-robin
**Description:** Fault windows, COMPONENT_DOWN, round-robin target selection.
- [ ] Outage 4000-6000 ms fails dependents with COMPONENT_DOWN (2 and 3 replicas)
**Verification:** Golden 4 green.
**Dependencies:** T10 | **Files:** engine + tests | **Scope:** M

### Task 12: Engine - metrics, overload, unsupported features
**Description:** Metrics with documented denominators; unsupported feature errors.
- [ ] Overload (40 offered vs 20/s ceiling) fills queue
- [ ] Retries/parallel/cycles return named errors
- [ ] All golden tests pass
**Verification:** Full engine suite; grep confirms no agent/network imports.
**Dependencies:** T11 | **Files:** engine + tests | **Scope:** M

### Checkpoint: Engine green
- [ ] Every golden test green; engine isolation verified

## Phase 2: Agent (Oct 30)

### Task 13: Evidence and claim-check spec (doc 9)
- [ ] Defines supported claim and metric-path matching
- [ ] A fabricated number test case is specified
**Dependencies:** T8 | **Files:** `docs/09-claim-check.md` | **Scope:** S

### Task 14: UI spec (doc 10)
- [ ] 4 screens, each with loading/empty/error/failure states
- [ ] Prediction prompt, card copy, keyboard, reduced motion
**Dependencies:** T2 (image decision), T8 | **Files:** `docs/10-ui-spec.md` | **Scope:** M

### Task 15: Typed tool layer
**Description:** Tools wrapping engine; reject unknown names/args; return summaries not raw events.
- [ ] Unknown tool/arg rejected
- [ ] Outputs contain no raw event stream
**Verification:** Tool-layer unit tests.
**Dependencies:** T12, T8 | **Files:** `lib/agent/tools.ts`, tests | **Scope:** M

### Task 16: Claim checker
- [ ] Fabricated number rejected; matching number passes
**Verification:** Unit tests.
**Dependencies:** T13, T15 | **Files:** `lib/agent/claims.ts`, tests | **Scope:** S

### Task 17: Agent loop and Meta API route
**Description:** Server route handler (read `node_modules/next/dist/docs/` first), state machine, budget, stop rules; key server-side only.
- [ ] API key absent from client bundle
- [ ] Budget and stop rules enforced
**Verification:** Tests with mocked provider; manual call.
**Dependencies:** T15, T16 | **Files:** `app/api/agent/route.ts`, `lib/agent/loop.ts`, tests | **Scope:** M

### Task 18: Outage investigation end-to-end
- [ ] Runs to `complete` with all numbers claim-checked
- [ ] Refuses/asks on: missing DB time, impossible budget, unsupported feature
**Verification:** Scripted run + refusal test list.
**Dependencies:** T17 | **Files:** `lib/agent/eval/*.ts` | **Scope:** M

### Checkpoint: Agent works
- [ ] Outage end to end, no invented number; refusals pass

## Phase 3: UI (Oct 31 - Nov 1)

### Task 19: Evaluation and pilot plan (doc 11)
- [ ] Questions, scoring rule, sample size (5-10) written before the test
**Dependencies:** T14 | **Files:** `docs/11-eval-pilot.md` | **Scope:** S

### Task 20: Project home + model workspace
- [ ] Prediction prompt shown before any run
- [ ] Unsupported features disabled in UI
**Verification:** Manual + build.
**Dependencies:** T14, T15 | **Files:** `app/page.tsx`, `app/model/*`, components | **Scope:** M

### Task 21: Investigation view with replay
- [ ] Replays carry visible replay label
- [ ] Cards: question, finding, limit, recovery
**Dependencies:** T18, T20 | **Files:** `app/investigate/*`, components | **Scope:** M

### Task 22: Comparison view and failed-fix flow
- [ ] Before/after runs compared with evidence run IDs
**Dependencies:** T21 | **Files:** `app/compare/*`, components | **Scope:** M

### Task 23: Overload scenario in demo path; start pilot
- [ ] Overload beat works live; pilot begins with doc 11 protocol
**Dependencies:** T19, T22 | **Files:** scenario wiring | **Scope:** S

### Checkpoint: Both demo beats live
- [ ] Fresh person completes first experiment unaided

## Phase 4: Hardening and submission (Nov 2 - 4)

### Task 24: States, provider-down fallback, evidence export, feature freeze
- [ ] Loading/empty/invalid/failed/cancelled/provider-down states all reachable
- [ ] Evidence export works
**Dependencies:** T23 | **Scope:** M

### Task 25: Pilot results into doc 11; update docs 4 and 10
**Dependencies:** T23 | **Files:** docs | **Scope:** S

### Task 26: README and submission docs (doc 12)
- [ ] Setup, architecture, Meta-usage statement, limits
- [ ] Stranger can run from README alone
**Dependencies:** T24 | **Files:** `README.md`, `docs/12-demo-script.md` | **Scope:** M

### Task 27: Record video; public repo; clean-clone check
- [ ] 3-minute video, replay shots marked; repo public; license per portal
**Dependencies:** T26 | **Scope:** S

### Task 28: Submit
- [ ] Submitted hours before cutoff
**Dependencies:** T27 | **Scope:** XS

### Checkpoint: Submitted
