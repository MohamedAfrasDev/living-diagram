# Implementation Plan: LivingDiagrams

Scope source: `AGENTS.md` ("Build ONLY") and `docs/01-product-one-pager.md`. Tasks are tracked in `tasks/todo.md`. Deadline: Nov 2 (stated by Afras); target submission Nov 1; official cutoff unconfirmed (D-002).

## Overview

A fixed five-node system (Gateway, Order, Payment, Cache, DB) runs on a deterministic tick-based TypeScript simulator. One fault: Payment slowed 20x. A Muse Spark agent investigates through typed tools, may change four knobs (`timeoutMs`, `retries`, `circuitBreaker`, `bulkhead`), and every number it states is checked against recorded metrics. A Next.js canvas replays the engine's events. No hosting; judges use the video and run it locally from the README.

## Architecture decisions

- Engine in `lib/engine/`: plain TypeScript, no network, no model calls, never imports the agent. Integer ms ticks, seeded generator only.
- Agent in `lib/agent/`: typed tools; unknown tool or argument rejected; claim checker gates output.
- Contracts in `lib/contracts/`: schemas shared by engine, agent and UI.
- Meta key on the server only (route handler). Without a key the app runs in labeled Replay mode.
- Next.js caveat: `AGENTS.md` says this version has breaking changes. Read `node_modules/next/dist/docs/` before writing route handlers or pages.
- Only work from Oct 26, 2026 counts.

## Dependency order

```
docs (01-07) -> spike (Meta tool calling) ----------------------------+
              -> golden test (red) -> engine (green) -> tool layer -> claim checker -> agent loop -> golden run recorded
                                                                                         |
                                       canvas + panels (after engine green) <------------+
                                                                       -> README, clean clone, tests, video -> submit
```

## Phases

- **Phase 0 (Oct 28):** docs written; Meta tool-call spike; failing golden test already in `lib/engine/simulate.test.ts`.
- **Phase 1 (Oct 29):** engine green against the golden tests and invariants. No UI before this.
- **Phase 2 (Oct 30):** typed tools, claim checker, agent loop, agent test, record one real golden run.
- **Phase 3 (Oct 31):** canvas, metrics panel, agent timeline, Replay mode and label, `.env.example`, README draft.
- **Phase 4 (Nov 1):** clean-clone test, 3 testers, video, submit. Nov 2 is buffer only.

## Risks and mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Muse Spark tool calling unreliable or access blocked | High | Spike today; fallback is constrained JSON plus validation (D-009) |
| The scenario does not produce the intended story | Resolved | D-014 to D-017: first template failed, one pre-registered change, then the bad-fix and good-fix definitions were changed on disk and disclosed. The honest finding is more load and slower tail, not a higher error rate |
| D-003 or D-005 rejected after code is written | Med | Afras decides today, before engine work |
| Agent test shows low success | Med | Report it honestly; apply the decision rule in doc 07 |
| Judges lack a key | Med | Labeled Replay mode; golden run committed |
| Deadline timezone unclear | Med | Submit Nov 1 |
| Next.js version differs from training data | Med | Read bundled docs first |
| Scope creep | Med | Won't list in doc 01 is binding |

## Open questions

See `docs/decision-log.md`: D-002, D-009, D-013, plus the proposed decisions D-003 to D-008, D-010, D-012.
