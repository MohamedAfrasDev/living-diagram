# Rules, Deadline and Day-1 Spike

Status: **incomplete.** The portal checks and the Meta API spike need Afras's event-portal login and API key. Nothing below is marked done unless it was verified.

## 1. Portal checklist (source: participant guide, read 2026-10-29)

| Item | Answer | Source |
| --- | --- | --- |
| Final cutoff | **Wed Nov 4, 9:00 PM ET** (guide also writes EST; same offset on that date). Afras's internal freeze: Nov 2 | guide section 3 and 7 |
| Video | **3-minute demo video**, a primary judging artifact; must show what was built during the event | guide section 7 |
| Judging | Stage 1 pass/fail (fits theme, reasonably uses Meta models); Stage 2 rubric Impact 30, Meta tooling 25, Technical 20, Demo 25; top 5 per track to a live final round | guide section 8 |
| Eligible models | Muse Spark series, Muse Wonder, Muse Image, Muse Voice Transcribe, SAM 3.1 via Meta Model API; open weights Muse Glimmer and Muse Spark Open (Baseten: `meta-models/muse-spark-open-1026`); Muse Code to build | guide sections 1 and 6 |
| Repo | **Public** | guide section 4 |
| New work only | Must be built during the event (building period Oct 27 - Nov 4); say clearly what is new, or risk disqualification. Disclose the create-next-app scaffold as boilerplate | guide section 4 |
| Best Agentic Use-Case ($5K) | Autonomy, effectiveness, practical usefulness; judged, no separate entry described | guide section 9 |
| Most Viral ($20K) | Post the demo on X and submit the link; engagement counted to Nov 8 EOD | guide section 9 |
| Credits | $150 Meta Model API credits; claim by Nov 4, 9 PM ET with the form; credit card required (pre-authorization released); set a spend limit | guide section 5 |
| Team | Solo allowed; list everyone who worked on the project | guide section 7 |
| Anti-projects | Includes simple "AI for Education" chatbots, basic RAG, medical advice | guide section 4 |
| Judge access to a live product | Guide mentions "live product"; Afras's host said hosting is not required (D-020) | guide section 7 |
| Office hours | Discord #office-hours, 10-11 AM ET on weekdays; ask about tool calling there | guide section 3 |

## 2. Tool-calling spike (do this first, today)

Goal: decide whether the agent can rely on native tool calling through the Meta Model API. Per the Meta docs (D-022): base URL `https://api.meta.ai/v1`, Responses API, model `muse-spark-1.3`, key in env var `MODEL_API_KEY`, `tool_choice` supports only `auto`. The script is `scripts/spike-tool-calling.mjs`; it reads the key from the environment, is not part of the product, and never prints or stores it.

- Script lives outside the product (scratch folder). The key is read from an env var and never committed.
- Prompt: given a 2-tool schema (`simulate(config)` and `get_metrics(run_id)`), ask "Run the baseline and report the error rate."
- Run it **10 times** (cut from 20 because of the deadline). Score each run 0/1 on: (a) valid tool name, (b) arguments match schema, (c) no invented tool, (d) the final answer uses only returned numbers.
- **Go** if at least 9 of 10 pass all four. Otherwise **fallback**: constrained JSON output plus validation; log it in `decision-log.md`.

| Run | a | b | c | d |
| --- | --- | --- | --- | --- |
| 1, 2, 4, 5, 7, 8 | 1 | 1 | 1 | 1 |
| 3, 6, 9 | 1 | 1 | 1 | 0 (first scorer: see note) |
| 10 | HTTP 503 from the provider, no model output | | | |

First run (2026-10-29, `muse-spark-1.3`, original scorer): **6 of 10 passed all four checks.** Detail: 9 of 9 runs that reached the model had a valid tool name, schema-matching arguments, no invented tool, and called a tool before answering (2 calls each). Runs 3, 6 and 9 failed check (d) only because the answer echoed the model's own tool arguments ("retries 0, paymentSlowdown 1") and the scorer allowed only numbers from tool *results*; doc 03 says knob values are checked against recorded call arguments, so that scorer was wrong. Run 10 was a transient provider error (HTTP 503 "persistence service error") that the script did not retry. Both scorer problems were fixed after seeing this result (D-023). **Re-run with the fixed script (2026-10-29): 9 of 10 passed all four checks, which meets the bar.** Run 4 failed with HTTP 400 "referenced response not found or expired" when the script sent `previous_response_id`: a provider-side persistence error, the second in 20 attempts (the first was the 503 "persistence service error"). Zero transport retries were needed. Design consequence (D-024): the agent loop does not depend on server-stored responses.

## 3. Exit criteria

- [x] Portal checklist filled with sources
- [x] 10 spike runs scored with the fixed scorer: 9 of 10 (first run: 6 of 10 under the original scorer, see table)
- [ ] Spike result and any fallback logged in `decision-log.md`
