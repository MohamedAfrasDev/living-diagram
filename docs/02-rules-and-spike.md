# Rules, Deadline and Day-1 Spike

Status: **incomplete.** The portal checks and the Meta API spike need your event portal login and API key, so I have not run them. Nothing below is marked done unless it was verified.

## 1. Portal checklist (answer from the event portal, record the date)

| Item | Answer | Source / date |
| --- | --- | --- |
| Final cutoff in your time zone (plan assumes 9 PM ET Nov 4 = early Nov 5 Sri Lanka, sources differ by an hour) | _unconfirmed_ | |
| Required video length (plan assumes 3 min) | _unconfirmed_ | |
| Judging weights (equal vs 30/25/25/20) | _unconfirmed_ | |
| Eligible Meta models (Muse Spark via Meta Model API only, or open-weights too) | _unconfirmed_ | |
| Repo license requirement; how "work done during the event" is checked | _unconfirmed_ | |
| Tool calling supported on the chosen model | _see spike_ | |
| Credit limit before charges | _unconfirmed_ | |
| Who may be named on the entry (solo, one representative) | _unconfirmed_ | |

## 2. Tool-calling spike protocol

Goal: decide if the agent can rely on native tool calling.

- Model: the Meta model chosen from the checklist (Muse Spark per the plan).
- Test prompt: given a 2-tool schema (`run_scenario(scenario_id)`, `get_metric(run_id, path)`), ask "Run the outage scenario and report its success rate."
- Run it **20 times**. Script lives in scratch/`scripts/`, not in the product; the key is read from an env var, never committed.
- Score each run (0/1 each): (a) valid tool name, (b) arguments match schema, (c) no invented tool, (d) final answer uses only returned numbers.
- **Go** if at least 18/20 runs pass all four; otherwise **fallback**: constrained prompt plus JSON validation, log in `decision-log.md`.

| Run | a | b | c | d |
| --- | --- | --- | --- | --- |
| 1-20 | _not run_ | | | |

## 3. Image-input test

Send one hand-drawn topology photo and ask for the nodes it contains. **Go** only if it lists all nodes correctly in 3 of 3 tries. Otherwise sketch import stays cut (D-001). Result: _not run_.

## 4. Exit criteria for this doc

- [ ] Checklist filled with sources
- [ ] 20 runs scored
- [ ] Image go/no-go logged in `decision-log.md`
