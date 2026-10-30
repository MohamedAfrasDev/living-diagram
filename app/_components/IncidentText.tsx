"use client";

// Fill from incident text (docs/11-incident-text.md). The developer pastes text;
// Muse Spark proposes values with the quote each came from; nothing is applied
// until they press "Use these numbers", and the values then land in the normal
// Your numbers form, where validation and the Custom badge apply. Closing the
// box discards everything. The text is sent to the server route only.
import { useRef, useState } from "react";
import { FIELD_KEYS, MAX_INCIDENT_TEXT, appliedValues, type ExtractionResult, type FieldKey, type FieldResult } from "@/lib/agent/extract";
import { fieldLabel } from "@/lib/ui/numbers";
import { Badge, Button } from "./ui";

const labelOf = (key: FieldKey) => fieldLabel(key.includes(".") ? `nodes.${key}` : key);

function show(key: FieldKey, value: number): string {
  if (key.endsWith("localMs") || key === "arrivalIntervalMs") return `${value} ms`;
  if (key === "cacheMissRate") return `${Math.round(value * 100)}%`;
  if (key === "faultFactor") return `${value}x slower`;
  return String(value);
}

const STATE: Record<Exclude<FieldResult["state"], "not_found">, { tone: "ok" | "accent" | "warn" | "danger"; text: string }> = {
  found: { tone: "ok", text: "found" },
  converted: { tone: "accent", text: "converted" },
  conflict: { tone: "warn", text: "conflict" },
  rejected: { tone: "danger", text: "rejected" },
};

function Row({ k, f }: { k: FieldKey; f: Exclude<FieldResult, { state: "not_found" }> }) {
  const badge = STATE[f.state];
  return (
    <li className="border-t border-border py-2 first:border-t-0">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-medium">{labelOf(k)}</span>
        <Badge tone={badge.tone}>{badge.text}</Badge>
        {f.state === "found" || f.state === "converted" ? <span className="num">{show(k, f.value)}</span> : null}
        {f.state === "converted" ? <span className="text-muted">(text said {f.raw.value} {f.raw.unit})</span> : null}
        {f.state === "rejected" ? <span className="text-danger">{f.message}</span> : null}
        {f.state === "conflict" ? <span className="text-warn">the text gives different values; none is used</span> : null}
      </div>
      {f.state === "conflict" ? (
        f.candidates.map((c) => (
          <p key={c.value + c.quote} className="mt-0.5 text-[11px] text-muted">
            <span className="num">{show(k, c.value)}</span>: “{c.quote}”
          </p>
        ))
      ) : (
        <p className="mt-0.5 text-[11px] text-muted">“{f.quote}”</p>
      )}
    </li>
  );
}

export function IncidentText({ offReason, onApply }: { offReason: string | null; onApply: (values: Partial<Record<FieldKey, number>>) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ExtractionResult | null>(null);
  const abort = useRef<AbortController | null>(null);

  const close = () => {
    abort.current?.abort();
    setOpen(false);
    setText("");
    setResult(null);
    setError(null);
    setBusy(false);
  };

  const read = async () => {
    const controller = new AbortController();
    abort.current = controller;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/extract", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }), signal: controller.signal });
      const body: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const message = typeof body === "object" && body !== null && "message" in body ? String((body as { message: unknown }).message) : `request failed (${res.status})`;
        setError(message);
      } else {
        setResult((body as { result: ExtractionResult }).result);
      }
    } catch {
      if (!controller.signal.aborted) setError("The request failed. Check the connection and try again.");
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  };

  if (!open) {
    return (
      <div className="mt-3">
        <Button onClick={() => setOpen(true)} disabled={offReason !== null}>
          Fill from incident text
        </Button>
        {offReason ? <p className="mt-1 text-[11px] text-muted">{offReason}</p> : null}
      </div>
    );
  }

  const applicable = result ? appliedValues(result) : {};
  const count = Object.keys(applicable).length;
  const shown = result ? FIELD_KEYS.filter((k) => result.fields[k].state !== "not_found") : [];

  return (
    <div className="mt-3 rounded-md border border-border p-3">
      <label className="block text-xs text-muted">
        Paste incident text (postmortem, chat thread, config)
        <textarea
          className="mt-1 h-28 w-full rounded-md border border-border bg-surface px-2 py-1 text-sm text-foreground"
          value={text}
          maxLength={MAX_INCIDENT_TEXT}
          onChange={(e) => setText(e.target.value)}
          disabled={busy}
        />
      </label>
      <p className="mt-1 text-[11px] text-muted">
        Sent to Meta’s model to read; this app stores nothing. Do not paste secrets or customer data. {text.length.toLocaleString("en-US")} / {MAX_INCIDENT_TEXT.toLocaleString("en-US")} characters.
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button kind="primary" onClick={read} disabled={busy || text.trim().length === 0}>
          {busy ? "Reading…" : "Read numbers"}
        </Button>
        <Button onClick={close}>Close and discard</Button>
      </div>
      {error ? (
        <p className="mt-2 text-xs text-danger" role="alert">
          {error}
        </p>
      ) : null}

      {result ? (
        <div className="mt-3" aria-live="polite">
          <p className="rounded-md border border-warn/40 bg-warn/5 px-3 py-2 text-xs text-warn">Model-extracted from your text. Check every value. Nothing is applied yet.</p>
          {shown.length === 0 ? <p className="mt-2 text-xs text-muted">The text did not state any of the numbers in a form that could be checked against it.</p> : <ul className="mt-2">{shown.map((k) => <Row key={k} k={k} f={result.fields[k] as Exclude<FieldResult, { state: "not_found" }>} />)}</ul>}
          <p className="mt-2 text-[11px] text-muted">
            {FIELD_KEYS.length - shown.length} of {FIELD_KEYS.length} fields were not found and keep the template numbers.
          </p>
          {result.unmapped.length > 0 ? (
            <div className="mt-2 text-[11px] text-muted">
              Not used, because they do not fit the five services:
              <ul className="list-disc pl-4">
                {result.unmapped.map((u) => (
                  <li key={u}>{u}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="mt-3">
            <Button
              kind="primary"
              disabled={count === 0}
              onClick={() => {
                onApply(applicable);
                close();
              }}
            >
              Use these numbers ({count})
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
