// Fill from incident text (docs/11-incident-text.md). Reads numbers out of text
// the developer pastes; applies nothing. The Meta API key stays on the server
// (rule 7). Guard order: REPLAY_ONLY, then NO_API_KEY, then the body, then BUSY.
// The pasted text is not logged or stored.
import { MAX_INCIDENT_TEXT, extractNumbers } from "../../../lib/agent/extract";
import { MetaProvider } from "../../../lib/agent/provider";
import { release, tryAcquire } from "../../../lib/busy";
import { LIVE_AGENT_OFF_REASON, isReplayOnly } from "../../../lib/hosting";

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  if (isReplayOnly(process.env.REPLAY_ONLY)) return json({ code: "REPLAY_ONLY", message: LIVE_AGENT_OFF_REASON }, 503);
  const apiKey = process.env.MODEL_API_KEY;
  if (!apiKey) return json({ code: "NO_API_KEY", message: "reading numbers from text is unavailable without a Meta API key" }, 503);

  let text: unknown;
  try {
    const body: unknown = await request.json();
    text = typeof body === "object" && body !== null ? (body as { text?: unknown }).text : undefined;
  } catch {
    return json({ code: "INVALID_BODY", message: "expected a JSON body" }, 400);
  }
  if (typeof text !== "string" || text.trim().length === 0 || text.length > MAX_INCIDENT_TEXT) {
    return json({ code: "INVALID_BODY", message: `text must be 1 to ${MAX_INCIDENT_TEXT} characters` }, 400);
  }
  if (!tryAcquire()) return json({ code: "BUSY", message: "another request is running" }, 429);
  try {
    const outcome = await extractNumbers(text, new MetaProvider({ apiKey, maxAttempts: 2 }), request.signal);
    if (outcome.ok) return json({ kind: "extraction", result: outcome.result }, 200);
    return json({ code: outcome.code, message: outcome.message }, outcome.code === "PROVIDER_UNAVAILABLE" ? 502 : 422);
  } catch {
    return json({ code: "PROVIDER_UNAVAILABLE", message: "the request failed unexpectedly" }, 502);
  } finally {
    release();
  }
}
