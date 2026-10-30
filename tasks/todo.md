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
- [x] T14: Golden run `data/golden/slow-payment-run-1.json` built from a real transcript (`scripts/build-golden.mjs`) and verified against the live engine by `lib/agent/replay.ts` (11 tests); the UI Replay mode (T17) will call `verifyGolden` before showing it

Checkpoint: slow-payment investigation completes with no unsupported number reaching the user.

## Phase 3: UI (Oct 31)

- [x] T15: Canvas drawing the engine's occupancy timeline (`recordTimeline`), with playback and a table alternative
- [x] T16: Agent timeline, evidence panel with matched comparison, manual knob mode, blocked-claim display, conclusion and limits cards
- [x] T17: Replay mode (verified before shown, persistent label), live streaming, no-key fallback, load and failure states. Checked in a browser; production build passes
- [x] T18: `.env.example` and README written and checked from a clean clone (no key). Placeholders to fill before submission: video link, hosted link, the author's firsthand note, tester results

## Phase 4: Submission (Nov 1; Nov 2 buffer)

- [ ] T19: Clean-clone run from README only. Done without a key (2026-10-29); still to do with a key, and again after the final commit
- [ ] T20: 3-tester check (protocol written, doc 07 section 4; testers not yet recruited or run)
- [ ] T21: 3-minute video from real output, replay segments labeled (script written: docs/08-demo-script.md; Afras records; two blanks: opening story, tester result)
- [x] T22a: Hosted replay-only guard built and tested (D-032 step 1). T22b (part): PR #2 merged into `main` and `main` verified from a fresh clone (D-035). [ ] Deploy the hosted replay copy: waiting for Afras's go (D-032)
- [ ] T22: Secrets check, repo public, X post (optional), submission text, submit before Nov 4, 9 PM ET; open it as a judge would

Cut order if behind: evidence export, second scenario, extra testers, panel polish. Never cut the golden test, claim checker, a live engine run, or the Replay label.

## Phase 5: Your numbers (option B, proposed D-037; build only after approval)

- [x] T23: Fixtures (72 default run hashes, default prompt, default tool definitions) and failing tests for G1 to G6: done
- [x] T24: Engine reads a Scenario; default results bit-exact; G1, G3, G4, G5: done
- [x] T25: Tools, contracts, prompt builder, route accept a scenario; G2, G6: done
- [x] T26: UI: Your numbers card, per-run scenario, canvas and evidence read the run's numbers, comparison rule: done
- [x] T27: Browser checks (light, dark, phone) found and fixed a result-cache bug (D-038); 3 live agent runs on custom numbers, exploratory: done
- [x] T28: Docs and wording (README, docs 06, 07, 08, 09, 10, decision log): done. Branch `your-numbers` is local only: not pushed, no PR

Kill criteria: G1 not green by end of Oct 30 means option A; UI not done by end of Oct 31 means engine and manual panel only, or revert.
