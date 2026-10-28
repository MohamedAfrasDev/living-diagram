# Rules, Deadline and Day-1 Spike

Status: **incomplete.** The portal checks and the Meta API spike need Afras's event-portal login and API key. Nothing below is marked done unless it was verified.

## 1. Portal checklist (answer from the portal, record the date)

| Item | Answer | Source / date |
| --- | --- | --- |
| Final cutoff, exact time and timezone (Afras says Nov 2; plan to submit Nov 1) | _unconfirmed_ | |
| Video length limit (host said 3 minutes) | _unconfirmed in portal_ | host statement |
| What counts as a working demo (host: runs from setup instructions plus video; hosting not required) | accepted | host statement |
| Judging weights (earlier screenshots: Impact 30, Meta tooling 25, Execution 20, Demo 25) | _unconfirmed_ | |
| Eligible Meta models; is Muse Spark via Meta Model API enough | _unconfirmed_ | |
| Does the portal want an API key or credentials for judging | _unconfirmed_ | |
| Repo license requirement; how "work done during the event" is checked | _unconfirmed_ | |
| Best Agentic Use-Case: is it a separate prize and how is it entered | _unconfirmed_ | |
| Credit limit before charges | _unconfirmed_ | |
| Who may be named on the entry (solo) | _unconfirmed_ | |

## 2. Tool-calling spike (do this first, today)

Goal: decide whether the agent can rely on native tool calling through the Meta Model API. The exact model ID, endpoint and tool-call format come from the official Meta Model API docs; this repo does not guess them (D-009).

- Script lives outside the product (scratch folder). The key is read from an env var and never committed.
- Prompt: given a 2-tool schema (`simulate(config)` and `get_metrics(run_id)`), ask "Run the baseline and report the error rate."
- Run it **10 times** (cut from 20 because of the deadline). Score each run 0/1 on: (a) valid tool name, (b) arguments match schema, (c) no invented tool, (d) the final answer uses only returned numbers.
- **Go** if at least 9 of 10 pass all four. Otherwise **fallback**: constrained JSON output plus validation; log it in `decision-log.md`.

| Run | a | b | c | d |
| --- | --- | --- | --- | --- |
| 1-10 | _not run_ | | | |

## 3. Exit criteria

- [ ] Portal checklist filled with sources
- [ ] 10 spike runs scored
- [ ] Spike result and any fallback logged in `decision-log.md`
