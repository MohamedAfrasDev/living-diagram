# LivingDiagrams: Product One-Pager

Oct 28, 2026 · @Afras · Status: draft, derived from `LivingDiagrams Documentation Plan.md`

## Problem

Students draw system diagrams (API, database, replicas) but cannot see how the system behaves under failure or load. Their intuition about outages and overload is often wrong, and a static diagram never corrects it.

## User

A student learning system design (first users: 5 to 10 classmates). Not a production engineer. Solo build, no accounts.

## What it does (30-second version)

1. The student draws a small topology and **predicts** what happens under a fault or load spike.
2. A deterministic simulator runs it: fixed arrival traces, exact numbers, same result every time.
3. An AI agent (a Meta model, tool calling only) investigates the run, proposes fixes, compares runs, and reports a claim with the evidence run IDs.
4. Every number the agent states is checked against recorded metrics. Unsupported numbers are blocked, not shown.

## MVP scope

- Two scenarios: **database outage** and **overload** (see `04-scenario-pack.md`).
- Four screens: project home, model workspace, investigation view with replay, comparison view.
- Prediction prompt before every run.
- Failed-fix flow: the student's first fix does not work, and the comparison shows why.
- Evidence export.

## Not doing

- Retries, queues and workers, deadlines, retry-storm scenario
- Accounts, sharing, collaboration, server-side scoring
- Diagram import from files, calibration against real measurements
- Stochastic workloads (fixed persisted arrival traces only)
- Sketch/image import (only if the Day-1 spike says go; see `decision-log.md`)

## Success

- Demo: a 3-minute video showing the wrong prediction, the failed fix, the overload surprise and the classmate result.
- Trust: no invented number in any agent output.
- Impact: classmates predict system behavior better after using it (measured by `11-eval-pilot.md`, written before the test).

## Hard constraints

- Only work built from Oct 26, 2026 counts for the event.
- Submit evening of Nov 4 (Sri Lanka time); official cutoff 9 PM ET Nov 4, unconfirmed.
- Meta API key stays on the server.
