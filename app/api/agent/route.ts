// Server-only route that runs one investigation and streams it as NDJSON
// (one JSON object per line). The Meta API key is read here from the
// environment (rule 7) and never reaches the browser. Without a key the route
// answers 503 NO_API_KEY so the UI can switch to labeled Replay mode. With
// REPLAY_ONLY=1 it answers 503 REPLAY_ONLY before looking at anything else.
import { investigate, type TranscriptEntry } from "../../../lib/agent/loop";
import { release, tryAcquire } from "../../../lib/busy";
import { LIVE_AGENT_OFF_REASON, isReplayOnly } from "../../../lib/hosting";
import { MetaProvider } from "../../../lib/agent/provider";
import { ToolSession } from "../../../lib/agent/tools";
import { validateScenario, type Scenario } from "../../../lib/engine/scenario";

const MAX_QUESTION = 500;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export async function POST(request: Request) {
  // A hosted replay copy refuses every request, even if a key is present.
  if (isReplayOnly(process.env.REPLAY_ONLY)) return json({ code: "REPLAY_ONLY", message: LIVE_AGENT_OFF_REASON }, 503);
  const apiKey = process.env.MODEL_API_KEY;
  if (!apiKey) return json({ code: "NO_API_KEY", message: "the agent is unavailable; use Replay mode" }, 503);

  let question: unknown;
  let rawScenario: unknown;
  try {
    const body: unknown = await request.json();
    const fields = typeof body === "object" && body !== null ? (body as { question?: unknown; scenario?: unknown }) : {};
    question = fields.question;
    rawScenario = fields.scenario;
  } catch {
    return json({ code: "INVALID_BODY", message: "expected a JSON body" }, 400);
  }
  if (typeof question !== "string" || question.trim().length === 0 || question.length > MAX_QUESTION) {
    return json({ code: "INVALID_BODY", message: `question must be 1 to ${MAX_QUESTION} characters` }, 400);
  }
  // The scenario is the user's own numbers; absent or null means the template.
  let scenario: Scenario | undefined;
  if (rawScenario !== undefined && rawScenario !== null) {
    const checked = validateScenario(rawScenario);
    if (!checked.ok) return json({ code: "INVALID_SCENARIO", message: `${checked.field} ${checked.message}` }, 400);
    scenario = checked.scenario;
  }
  // One model request at a time (shared with /api/extract) protects the credit balance.
  if (!tryAcquire()) return json({ code: "BUSY", message: "an investigation is already running" }, 429);

  const encoder = new TextEncoder();
  const session = new ToolSession({ scenario });
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (value: unknown) => controller.enqueue(encoder.encode(JSON.stringify(value) + "\n"));
      try {
        const outcome = await investigate({
          question: question.trim(),
          provider: new MetaProvider({ apiKey }),
          session,
          signal: request.signal,
          onEntry: (entry: TranscriptEntry) => send({ kind: "entry", entry }),
        });
        send({
          kind: "outcome",
          status: outcome.status,
          detail: outcome.detail,
          turns: outcome.turns,
          usage: session.usage,
          conclusion: session.conclusion,
          blocked: session.blocked,
        });
      } catch {
        send({ kind: "outcome", status: "provider_unavailable", detail: "the investigation failed unexpectedly", turns: 0 });
      } finally {
        release();
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" } });
}
