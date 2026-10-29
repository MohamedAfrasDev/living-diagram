# LivingDiagrams: Product One-Pager

Oct 28, 2026 · @Afras · Status: draft for freeze · Track: Meta Global AI Hackathon, "Build for Your World", Indie Developer

## One-liner

LivingDiagrams is an agent that investigates why a backend design fails. It runs controlled experiments on a deterministic simulator, tries fixes (including wrong ones), and states only conclusions whose numbers match recorded metrics.

## Problem (firsthand, write it in your own words)

"I added retries to make my service resilient, and I could not tell whether I had helped or caused a worse outage. A chatbot gave me a confident answer I could not verify."

- Who (D-021): **backend developers** reviewing a service's resilience settings before they ship: they know the patterns (timeouts, retries, circuit breakers, bulkheads) but cannot tell whether a setting helps or hurts under a slow dependency. Students are a secondary audience. This is an agent and simulator, not a tutoring chatbot.
- Today's workaround: blog posts, chatbots, guessing. Real chaos tooling is too heavy.
- Frequency is low and intensity is high, so this is a learning tool, not a daily tool.

## What it is

A local Next.js app with one screen and one task: "Checkout is failing, payment is slow. Fix it."

1. A fixed five-node system (Gateway, Order, Payment, Cache, DB) runs on a deterministic tick-based simulator.
2. One fault: Payment is 20x slower.
3. The Muse Spark agent investigates through typed tools only. It may change four knobs: `timeoutMs`, `retries`, `circuitBreaker`, `bulkhead`.
4. The engine is the only source of numbers. A claim checker blocks any number that does not match a recorded metric path.
5. The canvas replays the engine's event stream, so the animation is evidence and not decoration.

## Why it is agentic

- It chooses experiments from metrics; there is no fixed script.
- It can be wrong (for example `retries=3`) and recovers from engine evidence.
- It verifies its final fix on two seeds and on the no-fault baseline before concluding.
- It has a budget and stop rules, and may answer "insufficient evidence".
- It can act only through typed tools; unknown tools or arguments are rejected.

## MVP scope (build only this)

- Tick-based simulator in pure TypeScript. Same seed gives the same result.
- Nodes: Gateway, Order, Payment, Cache, DB. Knobs: the four above. Fault: Payment slowed 20x.
- Golden test first: baseline passes, fault fails (errorRate > 20%), bad fix (`retries=3`) is worse on downstream load and tail latency, good fix (`circuitBreaker` + `retries=0`) halves the error rate and reports its degraded share (D-017). No UI before it is green.
- Next.js canvas animating the engine's events, a metrics panel and an agent activity log.
- Agent via Meta Model API, tool calls only. Local state plus a recorded golden run (replay mode, labeled).

## Not building

Hosting a live-agent deployment (a replay-only link is allowed, D-020), accounts, Supabase, SAM, voice, image or sketch import, diagram authoring, load balancers, replicas, outages, queues-to-workers, deadlines, stochastic workloads, comparison UI beyond two runs side by side, evidence export (cut first if behind).

## How judges use it (no hosting required)

The host confirmed a deployed backend is not needed. A working demo means it runs from the setup instructions plus the demo video.

- Video: 3 minutes, real output, replay segments labeled.
- Local run: `npm install`, optional `.env.local` with `MODEL_API_KEY`, `npm run dev`.
- Without a key the app opens in Replay mode: the engine runs live, agent turns come from a recorded golden run and are labeled "Replay".
- Hosted link (D-020): a replay-only build with no Meta key on the server, published after the core is done, as a convenience for judges.

## Success

- Golden test green, then the agent test (doc 07) measured and reported honestly, misses included.
- Zero unsupported numbers reach the user.
- Fresh clone runs from the README alone.
- At least 2 of 3 testers explain why `retries=3` did not help (small sample, disclosed).

## Hard constraints

- Official deadline: Wed Nov 4, 9:00 PM ET (guide; 7:30 AM Nov 5 in Sri Lanka). Internal freeze: Nov 2, leaving Nov 3-4 as buffer.
- Repo must be public; the demo must show only what was built during the event (Oct 27 - Nov 4) and say so.
- Only work built from Oct 26, 2026 counts; no reuse of older code.
- The Meta API key stays on the server (env var, never committed).
