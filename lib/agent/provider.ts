// Meta Model API adapter (Responses endpoint, docs: dev.meta.ai, D-022).
// Stateless by design (D-024): every request carries the full ordered history
// and never `previous_response_id`, because stored responses failed in the
// spike. Server-side only: the key is read by the caller from the environment
// and is never logged, returned or placed in an error message.
import type { ToolDefinition } from "../contracts/tools";

export type InputItem =
  | { role: "user" | "assistant"; content: string }
  | { type: "function_call"; call_id: string; name: string; arguments: string }
  | { type: "function_call_output"; call_id: string; output: string };

export interface ModelCall {
  callId: string;
  name: string;
  arguments: string;
}

export interface ModelTurn {
  calls: ModelCall[];
  text: string;
}

// Same shape as ToolDefinition with any tool name, so a non-agent caller (the
// extraction route) can offer its own single tool.
export type ProviderTool = Omit<ToolDefinition, "name"> & { name: string };

export interface ProviderRequest {
  instructions: string;
  input: InputItem[];
  tools: ProviderTool[];
}

export interface Provider {
  respond(request: ProviderRequest, signal?: AbortSignal): Promise<ModelTurn>;
}

export class ProviderError extends Error {
  readonly status: number | null;
  readonly transient: boolean;
  constructor(message: string, status: number | null, transient: boolean) {
    super(message);
    this.name = "ProviderError";
    this.status = status;
    this.transient = transient;
  }
}

export interface MetaProviderOptions {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  maxAttempts?: number;
}

const DEFAULT_MODEL = "muse-spark-1.3";
const DEFAULT_BASE = "https://api.meta.ai/v1";

interface OutputItem {
  type?: string;
  call_id?: string;
  name?: string;
  arguments?: string;
  content?: { type?: string; text?: string }[];
}

export class MetaProvider implements Provider {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly maxAttempts: number;

  constructor(options: MetaProviderOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model ?? DEFAULT_MODEL;
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.maxAttempts = options.maxAttempts ?? 4;
  }

  async respond(request: ProviderRequest, signal?: AbortSignal): Promise<ModelTurn> {
    const body = JSON.stringify({
      model: this.model,
      instructions: request.instructions,
      input: request.input,
      tools: request.tools,
      tool_choice: "auto",
    });
    let last: ProviderError | null = null;
    for (let attempt = 0; attempt < this.maxAttempts; attempt++) {
      if (attempt > 0) await this.sleep(500 * 2 ** (attempt - 1));
      if (signal?.aborted) throw new ProviderError("request cancelled", null, false);
      let res: Response;
      try {
        res = await this.fetchImpl(`${this.baseUrl}/responses`, {
          method: "POST",
          headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
          body,
          signal,
        });
      } catch (e) {
        if (signal?.aborted) throw new ProviderError("request cancelled", null, false);
        last = new ProviderError(`network error: ${e instanceof Error ? e.message : "unknown"}`, null, true);
        continue;
      }
      if (res.ok) return parseTurn(await res.json());
      const detail = (await res.text()).slice(0, 300);
      const transient = res.status === 429 || res.status >= 500;
      last = new ProviderError(`HTTP ${res.status}: ${detail}`, res.status, transient);
      if (!transient) throw last;
    }
    throw last ?? new ProviderError("provider request failed", null, true);
  }
}

function parseTurn(json: unknown): ModelTurn {
  const output: OutputItem[] =
    typeof json === "object" && json !== null && Array.isArray((json as { output?: unknown }).output)
      ? ((json as { output: OutputItem[] }).output)
      : [];
  const calls: ModelCall[] = [];
  const text: string[] = [];
  for (const item of output) {
    if (item.type === "function_call" && item.name && item.call_id) {
      calls.push({ callId: item.call_id, name: item.name, arguments: item.arguments ?? "" });
    } else if (item.type === "message") {
      for (const part of item.content ?? []) if (part.text) text.push(part.text);
    }
    // Reasoning items are dropped: they are not replayed (stateless history).
  }
  return { calls, text: text.join(" ").trim() };
}
