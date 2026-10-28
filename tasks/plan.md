# Implementation Plan: LivingDiagrams (docs-first build)

Source: `docs/LivingDiagrams Documentation Plan.md` (Oct 27, 2026). Tasks are tracked in `tasks/todo.md`.

## Overview

LivingDiagrams is a hackathon project: a student predicts how a system topology behaves, a deterministic TypeScript simulation engine runs it, and a Meta-model agent investigates failures through typed tools, with every numeric claim verified against recorded metrics. The source doc sets 12 short specs, written in dependency order, each leading its build work by about half a day. The repo is a fresh Create Next App scaffold (`app/`, `package.json`, no engine/agent code yet). Submission cutoff is 9 PM ET Nov 4; plan to submit the evening of Nov 4 Sri Lanka time.

## Architecture Decisions

- **Docs lead code.** Each build phase starts only after its spec exists; golden tests are written by hand before the engine.
- **Engine is isolated.** Plain TypeScript, no network, no model calls, never imports the agent package (e.g. `lib/engine/`). Deterministic, integer-ms time, fixed persisted arrival traces.
- **Agent acts only through typed tools.** Unknown tool or argument is rejected. The model sees metric summaries and selected traces, never raw events.
- **Claim checker gates output.** A numeric claim must match a recorded metric path or it is blocked.
- **Server-only Meta key.** Calls go through Next.js route handlers.
- **Unsupported = disabled, not approximated.** Retries, parallel calls, cycles return named errors and are disabled in the UI.
- **Only work from Oct 26 counts.** The scaffold commit is boilerplate; no reuse of older code.
- **Next.js caveat.** `AGENTS.md` warns this Next version has breaking changes: read `node_modules/next/dist/docs/` before writing any Next code (route handlers, app router).
- **Decision log.** Dated append-only lines in `docs/decision-log.md`; if a spec is silent, add a question there instead of choosing.

## Dependency Graph

```
1 One-pager ─┬─> 2 Rules + Day-1 spike ──> (image import go/no-go) ──> 10 UI spec
             ├─> 4 Scenario pack ──> 5 Engine spec ──> 6 Golden tests ──> ENGINE CODE
             └─> 3 AGENTS.md ──> repo scaffold / test runner
5 + 4 ──> 7 Data contracts ──> 8 Agent spec ──> 9 Claim-check spec ──> AGENT + CHECKER CODE
7 + 8 + 9 ──> 10 UI spec ──> UI CODE ──> 11 Eval/pilot plan ──> pilot ──> 12 Demo + README
```

## Task List

### Phase 0: Foundations (Oct 28)
- [x] T1: Product one-pager (doc 1)
- [ ] T2: Rules review, decision log, Meta API spike (doc 2) — doc + protocol written; portal checks and 20 spike runs need Afras
- [x] T3: AGENTS.md + repo scaffold with test runner (doc 3)
- [x] T4: Scenario pack (doc 4)
- [x] T5: Engine semantics spec (doc 5)

### Checkpoint: Specs frozen (end Oct 28)
- [ ] Tool-call test scored 20 runs; image go/no-go logged; engine spec frozen; hello-world test passes in a fresh session

### Phase 1: Engine (Oct 29)
- [ ] T6: Golden test cases (doc 6), hand-computed first
- [ ] T7: Data contracts (doc 7) + schema validation of scenario pack
- [ ] T8: Agent spec (doc 8)
- [ ] T9: Engine core: single node, serial chain (golden 1-2), TDD
- [ ] T10: Engine: slots, queues, rejection (golden 3)
- [ ] T11: Engine: faults and COMPONENT_DOWN, round-robin (golden 4)
- [ ] T12: Engine: metrics + overload (golden 5), unsupported-feature errors

### Checkpoint: Engine green (end Oct 29)
- [ ] All golden tests pass; engine has no imports from agent/network

### Phase 2: Agent (Oct 30)
- [ ] T13: Evidence and claim-check spec (doc 9)
- [ ] T14: UI spec (doc 10)
- [ ] T15: Typed tool layer over engine (run, summarize, trace, compare)
- [ ] T16: Claim checker (rejects fabricated number)
- [ ] T17: Agent loop: Meta API route, state machine, budget, stop rules
- [ ] T18: Outage investigation end-to-end (agent eval set seed)

### Checkpoint: Agent works (end Oct 30)
- [ ] Outage investigation completes with zero invented numbers; refusal cases (missing DB time, impossible budget, unsupported feature) pass

### Phase 3: UI (Oct 31 - Nov 1)
- [ ] T19: Evaluation and pilot plan (doc 11)
- [ ] T20: Project home + model workspace (with prediction prompt)
- [ ] T21: Investigation view with replay (replay labeled)
- [ ] T22: Comparison view, failed-fix flow
- [ ] T23: Overload scenario wired into demo path; start classmate pilot

### Checkpoint: Both demo beats live (end Nov 1)
- [ ] Outage and overload both run live; a fresh person finishes a first experiment unaided

### Phase 4: Hardening and submission (Nov 2 - 4)
- [ ] T24: Error/empty/loading states, provider-down fallback, evidence export; feature freeze
- [ ] T25: Pilot results into doc 11; update docs 4 and 10 if needed
- [ ] T26: README, setup check, architecture and Meta-usage statement, limits (doc 12)
- [ ] T27: Record 3-minute video; public repo; verify clean-clone run
- [ ] T28: Submit in portal (fix-only day)

### Checkpoint: Submitted
- [ ] Submitted hours before cutoff

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Muse Spark tool calling unreliable | High | Day-1 spike, 20 scored runs; fall back to constrained prompt + JSON validation, log decision |
| Engine semantics wrong (everything downstream invalid) | High | Hand-computed golden tests before code; protect docs 5-9 time |
| Image import unsupported | Med | Cut sketch import; decide and log Oct 28 |
| Next.js version differs from training data | Med | Read bundled docs before route handlers/pages |
| Deadline timezone ambiguity (1 hr) | Med | Submit evening Nov 4 Sri Lanka time |
| Provider outage during demo | Med | Labeled replay fallback (T21, T24) |
| Scope creep (retries, accounts, stochastic loads) | Med | Cut list is binding |
| Rules ambiguity (judging weights, models, license) | Low | Portal checks in T2 |

## Open Questions

- Final cutoff in local time and required video length
- Judging weights (equal vs 30/25/25/20)
- Which Meta models count; tool-calling support; credit limit
- Repo license requirement and how "work done during the event" is verified
- Who is named on the entry (solo)
- Where engine/agent code lives (proposed `lib/engine`, `lib/agent`) - confirm in AGENTS.md (T3)
