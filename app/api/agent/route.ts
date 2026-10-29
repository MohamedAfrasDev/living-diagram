// Server-only route that runs one investigation and streams it as NDJSON
// (one JSON object per line). The Meta API key is read here from the
// environment (rule 7) and never reaches the browser. Without a key the route
// answers 503 NO_API_KEY so the UI can switch to labeled Replay mode.
import { investigate, type TranscriptEntry } from "../../../lib/agent/loop";
import { MetaProvider } from "../../../lib/agent/provider";
import { ToolSession } from "../../../lib/agent/tools";

const MAX_QUESTION = 500;

// One investigation at a time protects the credit balance.
let busy = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export async function POST(request: Request) {
  const apiKey = process.env.MODEL_API_KEY;
  if (!apiKey) return json({ code: "NO_API_KEY", message: "the agent is unavailable; use Replay mode" }, 503);

  let question: unknown;
  try {
    const body: unknown = await request.json();
    question = typeof body === "object" && body !== null ? (body as { question?: unknown }).question : undefined;
  } catch {
    return json({ code: "INVALID_BODY", message: "expected a JSON body" }, 400);
  }
  if (typeof question !== "string" || question.trim().length === 0 || question.length > MAX_QUESTION) {
    return json({ code: "INVALID_BODY", message: `question must be 1 to ${MAX_QUESTION} characters` }, 400);
  }
  if (busy) return json({ code: "BUSY", message: "an investigation is already running" }, 429);
  busy = true;

  const encoder = new TextEncoder();
  const session = new ToolSession();
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
        busy = false;
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" } });
}
