# Task List: LivingDiagrams

See `tasks/plan.md` for architecture and risks. One task per session; commit when its tests pass.

## Phase 0: Foundations (Oct 28)

- [x] T1: Rewrite docs 01-07 and decision log to the `AGENTS.md` scope
- [x] T2: Afras accepted D-003 to D-008, D-010, D-012; D-010 later superseded in part by D-017
- [x] T3: Meta API tool-calling spike: 9 of 10 with the corrected scorer (first run 6 of 10, D-023); 2 provider persistence errors in 20 attempts (D-024) (`scripts/spike-tool-calling.mjs`, doc 02). Afras runs it with `MODEL_API_KEY` set
- [x] T4: Portal check done from the guide (doc 02, D-019). Open: D-020 hosted link, D-021 framing
- [x] T3a: $150 Meta Model API credits claimed (Afras)

## Phase 1: Engine (Oct 29), failing test first

- [x] T5: Golden test file exists (`lib/engine/simulate.test.ts`); confirm it fails because `simulate` is missing
- [x] T6: Engine core: ticks, nodes, slots, FIFO queues, `QUEUE_FULL`, blocking calls. Baseline test green
- [x] T7: Fault and knobs: `timeoutMs`, `retries`, `bulkhead`, `circuitBreaker`, degraded responses. Golden tests green under the D-017 definitions (scenario changed by D-015 option A)
- [x] T8: Metrics and result shape (doc 05 section 7); invariant tests (slots, FIFO, queue bound, one outcome per request, no events after `H`)
- [x] T9 (part): tool contracts in `lib/contracts/tools.ts` (argument parsers, error codes, model tool definitions). Claim contracts come with T11

Checkpoint: engine tests green (33 of 33); engine has no agent or network imports. Still to do: boundary-tick ordering tests, contracts (T9).

## Phase 2: Agent (Oct 30)

- [x] T10: Typed tool layer over the engine (`simulate`, `get_metrics`, `get_trace`, `propose_patch`, `compare`) in `lib/agent/tools.ts`; unknown tool or argument rejected; budgets enforced. `conclude` arrives with T11
- [x] T11: Claim checker and `conclude` tool (`lib/agent/claims.ts`, 22 tests): fabricated, rounding, unlisted-token, knob, seed, ratio, difference, number-word, causal and direction cases
- [x] T12: Agent loop (`lib/agent/loop.ts`), Meta provider (`provider.ts`), system prompt (`prompt.ts`), route `app/api/agent/route.ts` (NDJSON stream, key server-side, 503 NO_API_KEY without a key). 15 new tests with a scripted provider. One live run completed (see doc 07, exploratory)
- [x] T13: Agent test. Trial 1: valid 6/6, confirmed fix 3/6 (bar 4, missed), unsupported 0. Trial 2 after a one-sentence prompt clarification: valid 6/6, confirmed fix 5/6 (bar met), unsupported 0 (doc 07, D-027, D-028)
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
- [ ] T22: Secrets check, repo public, X post (optional), submission text, submit before Nov 4, 9 PM ET; open it as a judge would

Cut order if behind: evidence export, second scenario, extra testers, panel polish. Never cut the golden test, claim checker, a live engine run, or the Replay label.
