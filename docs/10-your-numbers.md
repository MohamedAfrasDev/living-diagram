# Your Numbers (option B): spec

Status: **implemented on branch `your-numbers` (not merged, not pushed), 2026-10-30.** Decisions: D-037 (approved), D-038 (results). Gate results are in section 10.

## 1. Goal

Today the app simulates one fixed system. A developer can change four settings (`timeoutMs`, `retries`, `circuitBreaker`, `bulkhead`), the fault and a seed, but not the system. "Your numbers" lets a developer enter **their own capacities and timings** for the same five-service chain, so the engine, the manual runs and the agent investigate *their* numbers.

The shape stays fixed: Gateway, Order, Cache, Payment, DB, with the same request path (D-007). This is not an architecture builder (that is option C, a later feature with its own spec).

What the developer can do afterwards:

- Set workers, queue size and time per request for each of the five services.
- Set the request rate, the cache miss rate, and how much slower Payment becomes when the fault is on.
- Run the simulator by hand on those numbers, compare runs, and ask the agent about them.

What they still cannot do: add, remove or rewire services; change how the four settings behave (breaker opens after 5 failures for 2,000 ms, retry backoff 50 ms); change the 10-second arrival window or the 15-second run.

Honesty rule: numbers a user types are **inputs, not measurements**. The UI and the agent's limits must say so (section 6).

## 2. The scenario

One new type, `Scenario`, replaces the module constants in `lib/engine/scenario.ts`. `DEFAULT_SCENARIO` equals today's numbers exactly.

| Field | Meaning | Bounds | Default |
|---|---|---|---|
| `nodes.<id>.concurrency` | workers (slots) | integer 1 to 500 | per doc 04 |
| `nodes.<id>.queueCapacity` | waiting line | integer 0 to 500 | per doc 04 |
| `nodes.<id>.localMs` | time per request before any slowdown | integer 1 to 2,000 | per doc 04 |
| `arrivalIntervalMs` | one request every N ms | integer 10 to 200 (5 to 100 requests per second) | 20 |
| `cacheMissRate` | share of requests that also read DB | 0 to 1 in steps of 0.01 | 0.25 |
| `faultFactor` | how many times slower Payment is when the fault is on | integer 2 to 50 | 20 |

Derived: arrival window stays 10,000 ms, so offered requests = floor(10,000 / `arrivalIntervalMs`) (50 to 1,000). Cutoff stays 15,000 ms. Healthy means factor 1.

Validation returns a named error `INVALID_SCENARIO` with the field and the reason. Out-of-bounds values are rejected, never clamped.

## 3. Engine (`lib/engine/`)

- `scenario.ts`: export `Scenario`, `DEFAULT_SCENARIO`, `validateScenario`. Remove the loose constants the engine reads (`NODES`, `ARRIVAL_*`, `CACHE_MISS_RATE`), keeping them reachable through `DEFAULT_SCENARIO`.
- `simulate.ts`: `SimulateInput` gets an optional `scenario` (default `DEFAULT_SCENARIO`). Capacities, local times, arrival interval and count, cache miss rate come from it. `paymentSlowdown` must be 1 or `scenario.faultFactor`.
- **Hash rule:** for the default scenario the run hash is computed exactly as today. For any other scenario the scenario is added to the hashed input. This keeps every recorded golden result valid.
- The event budget (200,000) still applies; an oversized scenario returns `status: "incomplete"` and is never ranked.
- The timeline sampler and the metric paths are unchanged (node ids are fixed).

## 4. Agent, tools and route

- `lib/agent/prompt.ts`: `buildSystemPrompt(scenario)` inserts the request rate, the cache miss rate, the node numbers and the fault factor, and tells the agent that the numbers are the user's inputs and that if the **healthy system already fails** it must say so before testing fixes. For the default scenario the output must be **byte-identical** to today's prompt, so the evaluation in doc 07 stays valid. `SYSTEM_PROMPT` stays exported as the default.
- `lib/contracts/tools.ts`: `toolDefinitions(scenario)` returns the schemas with `paymentSlowdown` limited to `[1, faultFactor]` and the `get_trace` request id limited to the offered count. `TOOL_DEFINITIONS` stays as the default. `parseSimulateArgs` takes the scenario.
- `lib/agent/tools.ts`: `ToolSession` takes a scenario; `get_trace` bounds follow it; run records keep it.
- `app/api/agent/route.ts`: the body may include `scenario`. It is validated (400 `INVALID_SCENARIO`), then passed to the session and the prompt. Everything else (key handling, `REPLAY_ONLY`, one run at a time) is unchanged.
- The claim checker is unchanged: metric paths do not depend on the scenario.
- The agent still cannot change the scenario; it may only use the four settings.

## 5. UI (`app/_components/`)

- A **Your numbers** card with a table of the five services (workers, queue, ms) and the three global fields, inline validation, a "Reset to template" button, and a label "Numbers you entered. The engine does not measure them." Collapsed by default, so the first screen is unchanged.
- Each run carries a **scenario snapshot**. Manual runs use the current numbers; the Replay and the recorded agent runs always use the template numbers. Changing the card never rewrites existing runs.
- The canvas gauges, the evidence "Per-node detail" and the playback bounds read the selected run's scenario, not constants. A "Custom numbers" chip marks such runs; comparing runs with different scenarios shows **Not comparable**.
- "Ask the agent" sends the current scenario. The Replay banner says the recording used the template numbers.
- The hosted replay copy is unaffected (live agent off).

## 6. Wording that must change if this ships

README limits ("one template system" becomes "one fixed five-service chain; you can enter your own numbers, not your own architecture"), doc 06 (section 7 out of scope), doc 09 (a new scenario), the demo script (an optional "Your numbers" moment), and the agent's limits must say the numbers are the user's inputs. Do not claim it "models your system".

## 7. Gates (written before any code)

| Gate | Pass condition |
|---|---|
| G1 bit-exact default | the default scenario reproduces today's results: fault with defaults on seed 1 has run hash `0ff17241` and on seed 2 `85f1abac` (recorded from the current engine on 2026-10-30), all 119 existing tests pass without edits other than added scenario arguments, and `verifyGolden` on `public/golden/slow-payment-run-1.json` still re-runs all 20 calls |
| G2 prompt | `buildSystemPrompt(DEFAULT_SCENARIO)` equals the current prompt byte for byte (checked against a fixture saved before the refactor) |
| G3 validation | every bound in section 2 is rejected just outside and accepted at the edge; error names the field |
| G4 invariants | the invariant tests (slots, FIFO, queue bounds, one outcome per request, no events after cutoff) also pass on at least three custom scenarios |
| G5 behavior | more Payment workers or a lower request rate never raise the fault-alone error rate; a fault factor of 1 matches healthy; a higher request rate raises it. Stated as tests, not assumed |
| G6 tools and route | `paymentSlowdown` outside `[1, faultFactor]` is rejected; a bad `scenario` body returns 400 `INVALID_SCENARIO`; with the flag on `REPLAY_ONLY` still wins |
| G7 browser | in a browser: edit a number, run by hand, see the canvas gauges and evidence change; the Replay still verifies; light and dark; phone width |
| G8 agent | three live runs on one custom scenario, reported as exploratory with every miss. The 8-of-12 result in doc 07 applies **only** to the template numbers and is not re-claimed |

## 8. Effort, schedule and what to cut

About one working day of focused work: fixture and failing tests, then the engine (G1 to G5), tools, prompt and route (G2, G6), the UI (G7), live checks (G8), docs and a PR.

Proposed schedule: Oct 30 engine and tests, tools, prompt, route; Oct 31 UI, browser checks, live checks, docs, PR; Nov 1 video; Nov 2 submit or freeze. The tester check should run on the **final** UI, so run it after this lands.

**Kill criteria.** If G1 is not green by the end of Oct 30, stop and drop to option A. If the UI is not finished by the end of Oct 31, ship the engine and manual panel only, or revert; a failing gate is never merged.

**Cut order if short:** (1) editing the cache miss rate, (2) sending the scenario to the live agent (manual only), (3) the "Reset" button polish. Never cut G1, G3, the honesty labels or the "Not comparable" rule.

## 9. Risks

- A subtle engine change that shifts today's results: G1 and the recorded replay are the guard.
- A custom scenario where the healthy system already fails or nothing helps: the agent must say so; the "confirmed fix" rule (D-017) is relative and may confirm nothing, which is an honest answer.
- Time: this competes with the video and the tester check; hence the kill criteria.
- Users reading entered numbers as predictions of their real system: the labels and the limits cover it, and the submission wording must too.

## 10. Gate results (2026-10-30)

| Gate | Result |
|---|---|
| G1 bit-exact default | Pass. All 72 recorded run hashes reproduce, with no scenario and with the default passed explicitly (the two pinned values `0ff17241` and `85f1abac` included); the recorded replay still re-runs all 20 calls; the 119 earlier tests pass unchanged |
| G2 prompt | Pass. `buildSystemPrompt(DEFAULT_SCENARIO)` equals the saved prompt byte for byte, and the default tool definitions equal the saved definitions (the comparison normalises Windows line endings) |
| G3 validation | Pass. Every bound is accepted at the edge and rejected just outside, with the field named; nothing is clamped |
| G4 invariants | Pass on three custom scenarios across healthy, fault, retries, breaker and bulkhead runs, plus FIFO and an oversized run |
| G5 behavior | Pass, as strict inequalities: more Payment workers and a milder fault each lower the fault-alone error rate; a lower request rate does not raise it and a higher one does not lower it. The first version used `<=` and would have passed on equal results; it was tightened after the browser check below |
| G6 tools and route | Pass. `paymentSlowdown` is limited to 1 or the factor; a bad `scenario` body is a 400 `INVALID_SCENARIO` naming the field; `REPLAY_ONLY` still wins |
| G7 browser | Pass in light, dark and at phone width, **after fixing a bug it found**: the UI result cache key omitted the scenario, so a run on custom numbers was shown the template's cached result (94.0% errors instead of 0.0%). Fixed by moving the cache to `lib/ui/results.ts` with the scenario in the key and tests in both orders |
| G8 agent | Exploratory, reported in doc 07: 3 of 3 valid and confirmed, 0 unsupported numbers |

What was not done: no automated browser test; the live agent was run on one custom scenario only; the 8 of 12 evaluation was not repeated on custom numbers; the hosted replay copy does not expose Your numbers' live agent (unchanged).
