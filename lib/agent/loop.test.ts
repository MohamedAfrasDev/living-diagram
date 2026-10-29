import { describe, expect, test } from "vitest";
import { investigate, type TranscriptEntry } from "./loop";
import { SYSTEM_PROMPT } from "./prompt";
import { MetaProvider, ProviderError, type InputItem, type ModelTurn, type Provider, type ProviderRequest } from "./provider";
import { ToolSession } from "./tools";

const BASE = { timeoutMs: 1000, retries: 0, circuitBreaker: false, bulkhead: null };

let nextCall = 1;
const call = (name: string, args: unknown) => ({ callId: `call_${nextCall++}`, name, arguments: typeof args === "string" ? args : JSON.stringify(args) });
const turn = (...calls: ReturnType<typeof call>[]): ModelTurn => ({ calls, text: "" });
const textTurn = (text: string): ModelTurn => ({ calls: [], text });

class ScriptedProvider implements Provider {
  requests: ProviderRequest[] = [];
  constructor(private readonly script: (n: number, req: ProviderRequest) => ModelTurn | Error) {}
  async respond(req: ProviderRequest): Promise<ModelTurn> {
    this.requests.push(structuredClone(req));
    const out = this.script(this.requests.length, req);
    if (out instanceof Error) throw out;
    return out;
  }
}

const outputs = (input: InputItem[]) =>
  input.flatMap((i) => ("type" in i && i.type === "function_call_output" ? [JSON.parse(i.output) as { ok: boolean; data?: Record<string, unknown>; error?: { code: string } }] : []));

const errorRateOf = (input: InputItem[], runId: string): number => {
  for (const o of outputs(input)) {
    if (o.ok && o.data?.runId === runId) return (o.data.metrics as Record<string, number>).errorRate;
  }
  throw new Error(`no output for ${runId}`);
};

const claimAbout = (e: number) => ({
  text: `The fault run had errorRate ${e}.`,
  numbers: [{ token: String(e), kind: "metric", path: "run-1.errorRate" }],
  comparison: null,
});

describe("investigation loop", () => {
  test("runs tool calls, feeds results back, and completes with a checked conclusion", async () => {
    const provider = new ScriptedProvider((n, req) => {
      if (n === 1) return turn(call("simulate", { knobs: BASE, paymentSlowdown: 20, seed: 1 }));
      if (n === 2) return turn(call("simulate", { knobs: { ...BASE, retries: 3 }, paymentSlowdown: 20, seed: 1 }));
      if (n === 3) return turn(call("compare", { runA: "run-1", runB: "run-2" }));
      return turn(call("conclude", { claims: [claimAbout(errorRateOf(req.input, "run-1"))], rejectedProposals: [], limits: ["Template model, not real capacity."] }));
    });
    const entries: TranscriptEntry[] = [];
    const out = await investigate({ question: "Checkout is failing. Fix it.", provider, onEntry: (e) => entries.push(e) });
    expect(out.status).toBe("complete");
    expect(out.session.conclusion?.claims.length).toBe(1);
    expect(provider.requests.length).toBe(4);
    // The last request carries the full ordered history: user, then call/output pairs.
    const last = provider.requests[3].input;
    expect(last[0]).toEqual({ role: "user", content: "Checkout is failing. Fix it." });
    const types = last.slice(1).map((i) => ("type" in i ? i.type : i.role));
    expect(types).toEqual(["function_call", "function_call_output", "function_call", "function_call_output", "function_call", "function_call_output"]);
    // Rule 8: the model never receives the event stream.
    expect(JSON.stringify(provider.requests)).not.toContain("visitId");
    // Streaming callback saw the same entries the outcome holds.
    expect(entries.length).toBe(out.transcript.length);
    expect(out.transcript.at(-1)).toMatchObject({ kind: "status", status: "complete" });
  });

  test("a text-only turn is invalid: re-prompt once, then give up", async () => {
    const once = new ScriptedProvider((n) => (n === 1 ? textTurn("I think retries help.") : turn(call("conclude", { claims: [], rejectedProposals: [], limits: ["No evidence gathered."] }))));
    const first = await investigate({ question: "q", provider: once });
    expect(first.status).toBe("insufficient");
    expect(first.transcript.some((e) => e.kind === "nudge")).toBe(true);

    const twice = new ScriptedProvider(() => textTurn("Just chatting."));
    const second = await investigate({ question: "q", provider: twice });
    expect(second.status).toBe("invalid_output");
    expect(second.session.conclusion).toBeNull();
  });

  test("unknown tools and malformed arguments go back to the model as errors", async () => {
    const provider = new ScriptedProvider((n) => {
      if (n === 1) return turn(call("rm_rf", {}), call("simulate", "{not json"));
      return turn(call("conclude", { claims: [], rejectedProposals: [], limits: ["Gave up."] }));
    });
    const out = await investigate({ question: "q", provider });
    const second = outputs(provider.requests[1].input);
    expect(second.map((o) => o.error?.code)).toEqual(["UNKNOWN_TOOL", "INVALID_ARGS"]);
    expect(out.status).toBe("insufficient");
  });

  test("parallel calls in one turn run in order and each gets its own output", async () => {
    const provider = new ScriptedProvider((n) =>
      n === 1
        ? turn(call("simulate", { knobs: BASE, paymentSlowdown: 1, seed: 1 }), call("simulate", { knobs: BASE, paymentSlowdown: 20, seed: 1 }))
        : turn(call("conclude", { claims: [], rejectedProposals: [], limits: ["Two runs only."] })),
    );
    const out = await investigate({ question: "q", provider });
    const ids = outputs(provider.requests[1].input).map((o) => o.data?.runId);
    expect(ids).toEqual(["run-1", "run-2"]);
    expect(out.session.usage.simulations).toBe(2);
  });

  test("a blocked conclusion is returned to the model and kept for the UI; the model can fix it", async () => {
    const provider = new ScriptedProvider((n, req) => {
      if (n === 1) return turn(call("simulate", { knobs: BASE, paymentSlowdown: 20, seed: 1 }));
      if (n === 2) return turn(call("conclude", { claims: [{ text: "Order rejected 41 requests.", numbers: [], comparison: null }], rejectedProposals: [], limits: ["Template."] }));
      return turn(call("conclude", { claims: [claimAbout(errorRateOf(req.input, "run-1"))], rejectedProposals: [], limits: ["Template."] }));
    });
    const out = await investigate({ question: "q", provider });
    expect(outputs(provider.requests[2].input).at(-1)?.error?.code).toBe("CLAIM_BLOCKED");
    expect(out.session.blocked.length).toBe(1);
    expect(out.status).toBe("complete");
  });

  test("a provider outage ends as provider_unavailable and is never shown as success", async () => {
    const provider = new ScriptedProvider(() => new ProviderError("HTTP 503: down", 503, true));
    const out = await investigate({ question: "q", provider });
    expect(out.status).toBe("provider_unavailable");
    expect(out.session.conclusion).toBeNull();
    expect(out.transcript.at(-1)).toMatchObject({ kind: "status", status: "provider_unavailable" });
  });

  test("when the tool budget is used the loop says so, and conclude still works", async () => {
    const provider = new ScriptedProvider((n, req) =>
      n <= 30 && !JSON.stringify(req.input).includes("budget is used")
        ? turn(call("get_metrics", { runId: "run-1", paths: [] }))
        : turn(call("conclude", { claims: [], rejectedProposals: [], limits: ["Budget used before a fix was confirmed."] })),
    );
    const out = await investigate({ question: "q", provider, session: new ToolSession({ maxToolCalls: 3 }) });
    expect(out.status).toBe("insufficient");
    expect(out.transcript.some((e) => e.kind === "nudge" && /budget/i.test(e.text))).toBe(true);
  });

  test("hitting the turn limit without a conclusion is budget_exceeded", async () => {
    const provider = new ScriptedProvider(() => turn(call("get_metrics", { runId: "run-1", paths: [] })));
    const out = await investigate({ question: "q", provider, maxTurns: 3 });
    expect(out.status).toBe("budget_exceeded");
    expect(out.turns).toBe(3);
  });

  test("an aborted signal cancels before another model call", async () => {
    const controller = new AbortController();
    const provider = new ScriptedProvider(() => {
      controller.abort();
      return turn(call("get_metrics", { runId: "run-1", paths: [] }));
    });
    const out = await investigate({ question: "q", provider, signal: controller.signal });
    expect(out.status).toBe("cancelled");
    expect(provider.requests.length).toBe(1);
  });
});

describe("system prompt", () => {
  test("defines the default baseline and does not name the fix", () => {
    expect(SYSTEM_PROMPT).toContain("timeoutMs 1000, retries 0, circuitBreaker false, bulkhead null");
    // The prompt documents knobs; it must not tell the agent which one to use.
    expect(SYSTEM_PROMPT).not.toMatch(/(use|enable|turn on|recommend)[^.]{0,40}circuit ?breaker/i);
  });
});

describe("conclude budget", () => {
  test("conclude is exempt from the tool budget but capped at 4 attempts", () => {
    const s = new ToolSession({ maxToolCalls: 1 });
    s.call("get_metrics", { runId: "run-1", paths: [] });
    const bad = { claims: [{ text: "x 41", numbers: [], comparison: null }], rejectedProposals: [], limits: ["x"] };
    for (let i = 0; i < 4; i++) expect(s.call("conclude", bad).ok === false && (s.log.at(-1)?.result as { error: { code: string } }).error.code).toBe("CLAIM_BLOCKED");
    const fifth = s.call("conclude", bad);
    expect(fifth.ok === false && fifth.error.code).toBe("BUDGET_EXCEEDED");
  });
});

describe("Meta provider adapter", () => {
  const ok = (output: unknown[]) => new Response(JSON.stringify({ id: "resp_1", output }), { status: 200 });
  const req: ProviderRequest = { instructions: "be careful", input: [{ role: "user", content: "hi" }], tools: [] };

  test("sends a stateless Responses request with the bearer key and parses calls and text", async () => {
    const seen: { url: string; init: RequestInit }[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      seen.push({ url, init });
      return ok([
        { type: "reasoning", id: "rs_1", summary: [] },
        { type: "function_call", call_id: "c1", name: "simulate", arguments: "{}", status: "completed" },
        { type: "message", content: [{ type: "output_text", text: "done" }] },
      ]);
    }) as unknown as typeof fetch;
    const p = new MetaProvider({ apiKey: "sk-test-123", fetchImpl, sleep: async () => {} });
    const out = await p.respond(req);
    expect(out.calls).toEqual([{ callId: "c1", name: "simulate", arguments: "{}" }]);
    expect(out.text).toBe("done");
    expect(seen[0].url).toBe("https://api.meta.ai/v1/responses");
    const headers = seen[0].init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer sk-test-123");
    const body = JSON.parse(String(seen[0].init.body));
    expect(body.model).toBe("muse-spark-1.3");
    expect(body.tool_choice).toBe("auto");
    expect(body).not.toHaveProperty("previous_response_id");
    expect(body.instructions).toBe("be careful");
  });

  test("retries 503 and 429 with backoff, then succeeds", async () => {
    const statuses = [503, 429, 200];
    const sleeps: number[] = [];
    const fetchImpl = (async () => {
      const s = statuses.shift() ?? 200;
      return s === 200 ? ok([]) : new Response("busy", { status: s });
    }) as unknown as typeof fetch;
    const p = new MetaProvider({ apiKey: "k", fetchImpl, sleep: async (ms) => void sleeps.push(ms) });
    await p.respond(req);
    expect(sleeps.length).toBe(2);
    expect(sleeps[1]).toBeGreaterThan(sleeps[0]);
  });

  test("gives up after bounded retries with a transient ProviderError", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      return new Response("down", { status: 503 });
    }) as unknown as typeof fetch;
    const p = new MetaProvider({ apiKey: "k", fetchImpl, sleep: async () => {} });
    await expect(p.respond(req)).rejects.toMatchObject({ name: "ProviderError", transient: true, status: 503 });
    expect(calls).toBe(4);
  });

  test("does not retry a 400 and never puts the key in the error", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      return new Response('{"error":{"message":"bad request"}}', { status: 400 });
    }) as unknown as typeof fetch;
    const p = new MetaProvider({ apiKey: "sk-secret-value", fetchImpl, sleep: async () => {} });
    const err = await p.respond(req).catch((e: Error) => e);
    expect(calls).toBe(1);
    expect(err).toBeInstanceOf(ProviderError);
    expect(String((err as Error).message)).not.toContain("sk-secret-value");
  });

  test("network failures are retried as transient", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      if (calls < 3) throw new TypeError("fetch failed");
      return ok([]);
    }) as unknown as typeof fetch;
    const p = new MetaProvider({ apiKey: "k", fetchImpl, sleep: async () => {} });
    await p.respond(req);
    expect(calls).toBe(3);
  });
});
