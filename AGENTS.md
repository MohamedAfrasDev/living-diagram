<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# LivingDiagrams: project rules

Specs live in `docs/` (numbered 01-07); the plan is `tasks/plan.md`, tasks are `tasks/todo.md`, decisions are `docs/decision-log.md`.

## Layout

- `lib/engine/`: deterministic simulator (plain TypeScript)
- `lib/agent/`: typed tools, claim checker, agent loop
- `lib/contracts/`: schemas and types shared by engine, agent and UI
- `app/`: Next.js UI and server route handlers
- Tests sit next to the code as `*.test.ts`

## Commands

- `npm test`: run all tests (vitest)
- `npm run build`: production build
- `npm run lint`: eslint

## Rules for every coding session

1. Read the engine spec and golden tests before touching engine code. Write the failing test first.
2. The engine is plain TypeScript with no network calls and no model calls. It never imports the agent package.
3. The agent can only act through typed tools. An unknown tool name or argument is rejected, not guessed.
4. A numeric claim in agent output must match a recorded metric path. Anything else is blocked, not shown.
5. Never hardcode an expected result into the product or the demo. Prerecorded runs carry a visible replay label.
6. An unsupported feature is disabled in the interface, never accepted and ignored.
7. The Meta API key stays on the server (env var, never committed). The browser never sees it.
8. Send the model metric summaries and selected traces, never the full event stream.
9. One task per session, one document loaded for it, and a commit when its tests pass.
10. If the spec is silent, stop and add a question to `docs/decision-log.md` instead of choosing.

## Banned shortcuts

- No randomness or wall-clock time in the engine; time is integer milliseconds.
- No reuse of code written before Oct 26, 2026 (event rule).
- No `any` to silence type errors in engine or contracts.

Build ONLY:

1. Tick-based (not discrete-event) simulator in pure TS. Same seed = same result.
   Nodes: Gateway, Order, Payment, Cache, DB.
   Knobs only: timeoutMs, retries, circuitBreaker, bulkhead.
   Fault only: slow payment by 20x.
   Test first: Write a test that baseline passes, fault fails errorRate > 20%, bad fix (retries=3) fails worse, good fix (circuitBreaker+retries=0) passes. Do not build UI until this test is green.
2. Then: Next.js canvas animating that simulator.
3. Then: Muse Spark agent that outputs ONLY JSON patches using those 4 knobs via tool calls to simulate().
   No Supabase yet. No SAM. No voice. Use local state + golden run JSON.
