// Investigation loop (docs/03-agent-and-tools.md). The model acts only through
// ToolSession; every provider failure ends visibly, never as a success.
import { toolDefinitions, type ToolResult } from "../contracts/tools";
import { buildSystemPrompt } from "./prompt";
import type { InputItem, Provider } from "./provider";
import { ProviderError } from "./provider";
import { ToolSession } from "./tools";

export type InvestigationStatus =
  | "complete"
  | "insufficient"
  | "budget_exceeded"
  | "provider_unavailable"
  | "invalid_output"
  | "cancelled";

export type TranscriptEntry =
  | { kind: "user"; text: string }
  | { kind: "assistant_text"; text: string }
  | { kind: "tool_call"; callId: string; name: string; args: unknown }
  | { kind: "tool_result"; callId: string; name: string; result: ToolResult<unknown> }
  | { kind: "nudge"; text: string }
  | { kind: "status"; status: InvestigationStatus; detail: string };

export interface InvestigationOutcome {
  status: InvestigationStatus;
  detail: string;
  transcript: TranscriptEntry[];
  session: ToolSession;
  turns: number;
}

export interface InvestigateOptions {
  question: string;
  provider: Provider;
  session?: ToolSession;
  maxTurns?: number;
  signal?: AbortSignal;
  onEntry?: (entry: TranscriptEntry) => void;
}

const DEFAULT_MAX_TURNS = 24;
const MAX_TEXT_ONLY_TURNS = 2;
const TEXT_NUDGE = "Respond only with tool calls. When you are finished, call conclude (an empty claims list with limits is a valid insufficient-evidence answer).";
const BUDGET_NUDGE = "The tool call or simulation budget is used. Call conclude now with what you have recorded; insufficient evidence is a valid answer.";

export async function investigate(options: InvestigateOptions): Promise<InvestigationOutcome> {
  const { question, provider, signal, onEntry } = options;
  const session = options.session ?? new ToolSession();
  const maxTurns = options.maxTurns ?? DEFAULT_MAX_TURNS;
  const transcript: TranscriptEntry[] = [];
  const record = (entry: TranscriptEntry) => {
    transcript.push(entry);
    onEntry?.(entry);
  };
  // Built from the session's scenario; for the default scenario these are the
  // exact prompt and tool schemas the agent evaluation was run with.
  const instructions = buildSystemPrompt(session.scenario);
  const tools = toolDefinitions(session.scenario);
  const input: InputItem[] = [{ role: "user", content: question }];
  record({ kind: "user", text: question });

  let turns = 0;
  let textOnly = 0;
  let budgetNudged = false;

  const finish = (status: InvestigationStatus, detail: string): InvestigationOutcome => {
    record({ kind: "status", status, detail });
    return { status, detail, transcript, session, turns };
  };

  while (turns < maxTurns) {
    if (signal?.aborted) return finish("cancelled", "the investigation was cancelled");
    turns++;
    let reply;
    try {
      reply = await provider.respond({ instructions: instructions, input: [...input], tools: tools }, signal);
    } catch (e) {
      if (signal?.aborted) return finish("cancelled", "the investigation was cancelled");
      const message = e instanceof ProviderError ? e.message : "the model provider failed";
      return finish("provider_unavailable", message);
    }
    if (signal?.aborted) return finish("cancelled", "the investigation was cancelled");

    if (reply.text) record({ kind: "assistant_text", text: reply.text });

    if (reply.calls.length === 0) {
      // tool_choice only supports "auto", so a text-only turn is possible; it is invalid output.
      textOnly++;
      if (textOnly >= MAX_TEXT_ONLY_TURNS) {
        return finish("invalid_output", "the model answered in text instead of using the tools");
      }
      if (reply.text) input.push({ role: "assistant", content: reply.text });
      input.push({ role: "user", content: TEXT_NUDGE });
      record({ kind: "nudge", text: TEXT_NUDGE });
      continue;
    }

    for (const c of reply.calls) {
      let args: unknown = c.arguments;
      try {
        args = JSON.parse(c.arguments);
      } catch {
        // Passed through as a string; the tool layer rejects it as INVALID_ARGS.
      }
      record({ kind: "tool_call", callId: c.callId, name: c.name, args });
      input.push({ type: "function_call", call_id: c.callId, name: c.name, arguments: c.arguments });
      const result = session.call(c.name, args);
      record({ kind: "tool_result", callId: c.callId, name: c.name, result });
      input.push({ type: "function_call_output", call_id: c.callId, output: JSON.stringify(result) });
    }

    if (session.conclusion) {
      const claims = session.conclusion.claims.length;
      return finish(
        claims > 0 ? "complete" : "insufficient",
        claims > 0 ? `concluded with ${claims} checked claim(s)` : "concluded with insufficient evidence",
      );
    }

    const { toolCalls, simulations } = session.usage;
    if (!budgetNudged && (toolCalls >= session.maxToolCalls || simulations >= session.maxSimulations)) {
      budgetNudged = true;
      input.push({ role: "user", content: BUDGET_NUDGE });
      record({ kind: "nudge", text: BUDGET_NUDGE });
    }
  }
  return finish("budget_exceeded", `no conclusion within ${maxTurns} turns`);
}
