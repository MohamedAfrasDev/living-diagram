// Small shared presentation pieces. Status is always carried by text as well as colour.
import type { ReactNode } from "react";

export function Card({ title, aside, children, className = "" }: { title: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-border bg-surface ${className}`} aria-label={title}>
      <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h2>
        {aside}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

type Tone = "neutral" | "ok" | "warn" | "danger" | "replay" | "accent";

const TONES: Record<Tone, string> = {
  neutral: "border-border bg-surface-2 text-muted",
  ok: "border-ok/40 bg-ok/10 text-ok",
  warn: "border-warn/40 bg-warn/10 text-warn",
  danger: "border-danger/40 bg-danger/10 text-danger",
  replay: "border-replay/50 bg-replay-bg text-replay",
  accent: "border-accent/40 bg-accent/10 text-accent",
};

export function Badge({ tone = "neutral", children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-4 ${TONES[tone]}`}>
      {children}
    </span>
  );
}

export function Button({
  children,
  onClick,
  disabled,
  kind = "secondary",
  type = "button",
  label,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  kind?: "primary" | "secondary";
  type?: "button" | "submit";
  label?: string;
}) {
  const base = "inline-flex items-center justify-center rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";
  const style = kind === "primary" ? "bg-accent text-background hover:opacity-90" : "border border-border bg-surface hover:bg-surface-2";
  return (
    <button type={type} onClick={onClick} disabled={disabled} aria-label={label} className={`${base} ${style}`}>
      {children}
    </button>
  );
}
