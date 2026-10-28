# Task List: LivingDiagrams

See `tasks/plan.md` for architecture and risks. One task per session; commit when its tests pass.

## Phase 0: Foundations (Oct 28)

- [x] T1: Rewrite docs 01-07 and decision log to the `AGENTS.md` scope
- [x] T2: Afras accepted D-003 to D-008, D-010, D-012; D-010 later superseded in part by D-017
- [ ] T3: Meta API tool-calling spike, 10 runs scored (doc 02). Confirms model ID and tool-call format (D-009)
- [ ] T4: Portal check: cutoff time and timezone, video length, key handling for judges, license (doc 02)

## Phase 1: Engine (Oct 29), failing test first

- [x] T5: Golden test file exists (`lib/engine/simulate.test.ts`); confirm it fails because `simulate` is missing
- [x] T6: Engine core: ticks, nodes, slots, FIFO queues, `QUEUE_FULL`, blocking calls. Baseline test green
- [x] T7: Fault and knobs: `timeoutMs`, `retries`, `bulkhead`, `circuitBreaker`, degraded responses. Golden tests green under the D-017 definitions (scenario changed by D-015 option A)
- [x] T8: Metrics and result shape (doc 05 section 7); invariant tests (slots, FIFO, queue bound, one outcome per request, no events after `H`)
- [ ] T9: Contracts in `lib/contracts/` (knobs, run result, tool calls, claims) with schema validation tests

Checkpoint: engine tests green (33 of 33); engine has no agent or network imports. Still to do: boundary-tick ordering tests, contracts (T9).

## Phase 2: Agent (Oct 30)

- [ ] T10: Typed tool layer (`simulate`, `get_metrics`, `get_trace`, `propose_patch`, `compare`, `conclude`); unknown tool or argument rejected
- [ ] T11: Claim checker (fabricated, rounding, unlisted-token and knob-value cases)
- [ ] T12: Agent loop and Meta route handler (read Next docs first): state machine, budget, stop rules, key server-side only
- [ ] T13: Agent test, 6 runs, results recorded honestly (doc 07)
- [ ] T14: Record one real golden agent session to `data/golden/`

Checkpoint: slow-payment investigation completes with no unsupported number reaching the user.

## Phase 3: UI (Oct 31)

- [ ] T15: Canvas replaying engine events; per-node queue and slot animation
- [ ] T16: Agent timeline, evidence panel, manual knob mode, blocked-claim display
- [ ] T17: Replay mode with visible label and hash-mismatch check; degraded and error states
- [ ] T18: `.env.example`, README draft

## Phase 4: Submission (Nov 1; Nov 2 buffer)

- [ ] T19: Clean-clone run from README only, with and without a key
- [ ] T20: 3-tester check (doc 07)
- [ ] T21: 3-minute video from real output, replay segments labeled
- [ ] T22: Secrets check, repo public, submission text, submit; open it as a judge would

Cut order if behind: evidence export, second scenario, extra testers, panel polish. Never cut the golden test, claim checker, a live engine run, or the Replay label.
