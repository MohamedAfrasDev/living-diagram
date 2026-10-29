"use client";

// The agent timeline: every tool call and result the agent produced, blocked
// claims shown as blocked (never as conclusions), and the final conclusion with
// its limits. Failed steps stay visible.
import type { ReactNode } from "react";
import type { BlockedStatement, Conclusion } from "@/lib/contracts/claims";
import type { InvestigationStatus, TranscriptEntry } from "@/lib/agent/loop";
import { fmtRate } from "@/lib/ui/format";
import { describeKnobs } from "@/lib/ui/runs";
import { Badge, Button, Card } from "./ui";

export interface OutcomeView {
  status: InvestigationStatus;
  detail: string;
  conclusion: Conclusion | null;
}

const STATUS_TEXT: Record<InvestigationStatus, { tone: "ok" | "warn" | "danger"; text: string }> = {
  complete: { tone: "ok", text: "Complete: every claim is checked against recorded metrics" },
  insufficient: { tone: "warn", text: "Insufficient evidence: no fix confirmed" },
  budget_exceeded: { tone: "warn", text: "Stopped: no conclusion within the turn budget" },
  provider_unavailable: { tone: "danger", text: "Agent unavailable: the model provider failed" },
  invalid_output: { tone: "danger", text: "Stopped: the model did not use the tools" },
  cancelled: { tone: "warn", text: "Cancelled" },
};

type Json = Record<string, unknown>;
const asJson = (v: unknown): Json => (typeof v === "object" && v !== null ? (v as Json) : {});

function ToolBody({ name, args, data }: { name: string; args: Json; data: Json }): ReactNode {
  if (name === "simulate") {
    const m = asJson(data.metrics);
    const knobs = asJson(args.knobs) as unknown as Parameters<typeof describeKnobs>[0];
    return (
      <>
        <p className="text-xs text-muted">
          {args.paymentSlowdown === 20 ? "Payment 20× slower" : "Healthy"} · seed {String(args.seed)} · {describeKnobs(knobs)}
        </p>
        <p className="num mt-1 text-xs">
          Error rate <b>{fmtRate(Number(m.errorRate))}</b> · degraded <b>{fmtRate(Number(m.degradedRate))}</b> · attempts/request <b>{Number(m.paymentAttemptsPerRequest).toFixed(2)}</b>
        </p>
      </>
    );
  }
  if (name === "get_metrics") return <p className="text-xs text-muted">{Object.keys(asJson(data.values)).length} recorded values for {String(args.runId)}</p>;
  if (name === "get_trace") return <p className="text-xs text-muted">Request #{String(args.requestId)} in {String(args.runId)}: {Array.isArray(data.events) ? data.events.length : 0} events</p>;
  if (name === "propose_patch") {
    const diff = Array.isArray(data.diff) ? (data.diff as Json[]) : [];
    return <p className="text-xs text-muted">{diff.map((d) => `${String(d.field)}: ${String(d.from)} → ${String(d.to)}`).join("; ") || "no change"}</p>;
  }
  if (name === "compare") {
    const diff = Array.isArray(data.knobDiff) ? (data.knobDiff as Json[]) : [];
    return <p className="text-xs text-muted">{String(data.runA)} vs {String(data.runB)} (matched seed and fault): {diff.map((d) => `${String(d.field)} ${String(d.from)} → ${String(d.to)}`).join("; ") || "same knobs"}</p>;
  }
  if (name === "conclude") return <p className="text-xs text-ok">Conclusion accepted: all statements are supported by recorded values.</p>;
  return null;
}

function BlockedCard({ details }: { details: BlockedStatement[] }) {
  return (
    <div className="rounded-lg border border-danger/50 bg-danger/5 p-3" role="group" aria-label="Blocked statements">
      <div className="mb-1 flex items-center gap-2">
        <Badge tone="danger">Blocked</Badge>
        <span className="text-xs font-medium">Not shown as a conclusion</span>
      </div>
      <ul className="space-y-2">
        {details.map((b, i) => (
          <li key={i} className="text-xs">
            <p className="italic text-muted">&ldquo;{b.text}&rdquo;</p>
            <ul className="mt-0.5 list-disc pl-4 text-danger">
              {b.reasons.map((r, j) => (
                <li key={j}>{r}</li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}

function EntryView({
  entry,
  args,
  selectedRunId,
  onSelectRun,
}: {
  entry: TranscriptEntry;
  args: Json;
  selectedRunId: string | null;
  onSelectRun: (id: string) => void;
}) {
  switch (entry.kind) {
    case "user":
      return (
        <div className="rounded-lg border border-border bg-surface-2 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Question</p>
          <p className="mt-0.5 text-sm">{entry.text}</p>
        </div>
      );
    case "assistant_text":
      return <p className="px-1 text-xs italic text-muted">Agent: {entry.text}</p>;
    case "nudge":
      return <p className="px-1 text-xs text-warn">System: {entry.text}</p>;
    case "tool_call":
      return <p className="px-1 text-xs text-muted">Calling <code className="font-mono">{entry.name}</code>…</p>;
    case "status":
      return null;
    case "tool_result": {
      const r = entry.result;
      if (!r.ok) {
        if (r.error.code === "CLAIM_BLOCKED" && Array.isArray(r.error.details)) return <BlockedCard details={r.error.details as BlockedStatement[]} />;
        return (
          <div className="rounded-lg border border-danger/40 p-3">
            <p className="text-xs">
              <code className="font-mono font-semibold">{entry.name}</code> <Badge tone="danger">Rejected: {r.error.code}</Badge>
            </p>
            <p className="mt-1 text-xs text-muted">{r.error.message}</p>
          </div>
        );
      }
      const data = asJson(r.data);
      const runId = entry.name === "simulate" ? String(data.runId) : null;
      const active = runId !== null && runId === selectedRunId;
      const inner = (
        <>
          <p className="flex flex-wrap items-center gap-2 text-xs">
            <code className="font-mono font-semibold">{entry.name}</code>
            {runId ? <Badge tone="accent">{runId}</Badge> : null}
            <Badge tone="ok">ok</Badge>
          </p>
          <div className="mt-1">
            <ToolBody name={entry.name} args={args} data={data} />
          </div>
        </>
      );
      return runId ? (
        <button
          type="button"
          onClick={() => onSelectRun(runId)}
          aria-pressed={active}
          title="Show this run on the canvas and in the evidence panel"
          className={`w-full rounded-lg border p-3 text-left transition-colors ${active ? "border-accent bg-accent/5" : "border-border hover:bg-surface-2"}`}
        >
          {inner}
        </button>
      ) : (
        <div className="rounded-lg border border-border p-3">{inner}</div>
      );
    }
  }
}

function ConclusionCard({ conclusion }: { conclusion: Conclusion }) {
  return (
    <div className="space-y-3 rounded-lg border border-ok/40 bg-ok/5 p-3" role="group" aria-label="Conclusion">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ok">Conclusion</p>
      {conclusion.claims.length === 0 ? (
        <p className="text-sm">No fix was confirmed. The evidence gathered is insufficient.</p>
      ) : (
        <ul className="list-disc space-y-1.5 pl-4 text-sm">
          {conclusion.claims.map((c, i) => (
            <li key={i}>{c.text}</li>
          ))}
        </ul>
      )}
      {conclusion.rejectedProposals.length > 0 ? (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Rejected proposals</p>
          <ul className="mt-1 list-disc space-y-1.5 pl-4 text-sm">
            {conclusion.rejectedProposals.map((c, i) => (
              <li key={i}>{c.text}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="rounded-md border border-warn/40 bg-warn/5 p-2.5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-warn">Limits</p>
        <ul className="mt-1 list-disc space-y-1 pl-4 text-xs">
          {conclusion.limits.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function Timeline({
  entries,
  outcome,
  running,
  replaying,
  question,
  notice,
  selectedRunId,
  onQuestion,
  onAsk,
  onCancel,
  onReplay,
  onShowAll,
  onSelectRun,
  badge,
}: {
  entries: TranscriptEntry[];
  outcome: OutcomeView | null;
  running: boolean;
  replaying: boolean;
  question: string;
  notice: ReactNode;
  selectedRunId: string | null;
  onQuestion: (q: string) => void;
  onAsk: () => void;
  onCancel: () => void;
  onReplay: () => void;
  onShowAll: () => void;
  onSelectRun: (id: string) => void;
  badge: ReactNode;
}) {
  const callArgs = new Map<string, Json>();
  for (const e of entries) if (e.kind === "tool_call") callArgs.set(e.callId, asJson(e.args));
  const answered = new Set(entries.filter((e) => e.kind === "tool_result").map((e) => (e.kind === "tool_result" ? e.callId : "")));

  return (
    <Card title="Agent investigation" aside={badge}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onAsk();
        }}
        className="space-y-2"
      >
        <label className="block text-xs font-medium text-muted" htmlFor="question">
          Question
        </label>
        <textarea
          id="question"
          value={question}
          onChange={(e) => onQuestion(e.target.value)}
          rows={2}
          maxLength={500}
          disabled={running}
          className="w-full resize-none rounded-lg border border-border bg-surface px-3 py-2 text-sm disabled:opacity-60"
        />
        <div className="flex flex-wrap gap-2">
          {running ? (
            <Button onClick={onCancel}>Cancel</Button>
          ) : (
            <Button type="submit" kind="primary" disabled={question.trim().length === 0}>
              Ask the agent
            </Button>
          )}
          <Button onClick={onReplay} disabled={running}>
            Replay recorded run
          </Button>
          {replaying ? <Button onClick={onShowAll}>Show all</Button> : null}
        </div>
      </form>

      <div aria-live="polite" className="mt-3 min-h-5 text-xs">
        {notice}
      </div>

      <ol className="mt-2 space-y-2" aria-label="Investigation steps">
        {entries.map((entry, i) => {
          if (entry.kind === "tool_call" && answered.has(entry.callId)) return null;
          const view = <EntryView entry={entry} args={entry.kind === "tool_result" ? (callArgs.get(entry.callId) ?? {}) : {}} selectedRunId={selectedRunId} onSelectRun={onSelectRun} />;
          return view ? <li key={i}>{view}</li> : null;
        })}
        {running ? (
          <li className="px-1 text-xs text-muted" role="status">
            Agent is working…
          </li>
        ) : null}
      </ol>

      {outcome ? (
        <div className="mt-3 space-y-3">
          <Badge tone={STATUS_TEXT[outcome.status].tone}>{STATUS_TEXT[outcome.status].text}</Badge>
          {outcome.conclusion ? <ConclusionCard conclusion={outcome.conclusion} /> : null}
          {outcome.status !== "complete" && outcome.status !== "insufficient" ? <p className="text-xs text-muted">{outcome.detail}</p> : null}
        </div>
      ) : null}
      <p className="mt-3 text-[11px] text-muted">
        The agent acts only through typed tools. Every number in a conclusion is checked against a recorded engine metric; anything else is blocked.
      </p>
    </Card>
  );
}
