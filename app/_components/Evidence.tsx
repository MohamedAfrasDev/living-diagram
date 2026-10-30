"use client";

// The evidence panel: metrics for the selected run, optionally compared with
// another run under matched conditions. Every value is read from an engine
// result. errorRate and degradedRate always sit together (D-005).
import { NODE_IDS, isDefaultScenario } from "@/lib/engine/scenario";
import type { SimulationResult } from "@/lib/engine/simulate";
import { fmtMs, fmtRate, headlineRows, type MetricRow } from "@/lib/ui/format";
import { describeNumbers } from "@/lib/ui/numbers";
import { describeKnobs, sameNumbers, type UiRun } from "@/lib/ui/runs";
import { Badge, Card } from "./ui";

const LABEL: Record<string, string> = { gateway: "Gateway", order: "Order", cache: "Cache", payment: "Payment", db: "DB" };

function fmtDelta(key: string, d: number): string {
  const sign = d > 0 ? "+" : d < 0 ? "−" : "";
  const abs = Math.abs(d);
  if (key === "errorRate" || key === "degradedRate") return `${sign}${(abs * 100).toFixed(1)} pts`;
  if (key === "paymentAttemptsPerRequest") return `${sign}${abs.toFixed(2)}`;
  if (key === "latencyMs.p95") return `${sign}${abs.toLocaleString("en-US", { maximumFractionDigits: 0 })} ms`;
  return `${sign}${abs.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function Delta({ row, base }: { row: MetricRow; base: MetricRow | undefined }) {
  if (!base || row.value === null || base.value === null) return <span className="text-muted">n/a</span>;
  const d = row.value - base.value;
  if (Math.abs(d) < 1e-9) return <span className="text-muted">no change</span>;
  const worse = row.higherIsWorse === null ? null : row.higherIsWorse ? d > 0 : d < 0;
  const tone = worse === null ? "text-muted" : worse ? "text-danger" : "text-ok";
  const word = worse === null ? "" : worse ? " worse" : " better";
  return (
    <span className={tone}>
      {d > 0 ? "▲" : "▼"} {fmtDelta(row.key, d)}
      {word}
    </span>
  );
}

function RunSelect({ label, value, runs, none, onChange }: { label: string; value: string | null; runs: UiRun[]; none?: string; onChange: (id: string | null) => void }) {
  return (
    <label className="block text-xs text-muted">
      {label}
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}
        className="mt-0.5 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-xs text-foreground"
      >
        {none ? <option value="">{none}</option> : null}
        {runs.map((r) => (
          <option key={r.id} value={r.id}>
            {r.id} · {r.paymentSlowdown === 1 ? "healthy" : "fault"} · seed {r.seed} · {describeKnobs(r.knobs)}{isDefaultScenario(r.scenario) ? "" : " · custom numbers"}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Evidence({
  runs,
  selected,
  compare,
  selectedRun,
  compareRun,
  onSelect,
  onCompare,
}: {
  runs: UiRun[];
  selected: SimulationResult | null;
  compare: SimulationResult | null;
  selectedRun: UiRun | null;
  compareRun: UiRun | null;
  onSelect: (id: string) => void;
  onCompare: (id: string | null) => void;
}) {
  if (!selected || !selectedRun) {
    return (
      <Card title="Evidence">
        <p className="text-sm text-muted">No run yet. Replay the recorded investigation, ask the agent, or run the simulator by hand below.</p>
      </Card>
    );
  }
  const rows = headlineRows(selected);
  const baseRows = compare ? headlineRows(compare) : null;
  const comparable = compareRun !== null && compareRun.id !== selectedRun.id && compareRun.seed === selectedRun.seed && compareRun.paymentSlowdown === selectedRun.paymentSlowdown && sameNumbers(compareRun, selectedRun);
  const mismatch = compareRun !== null && compareRun.id !== selectedRun.id && !comparable;

  return (
    <Card title="Evidence" aside={<Badge tone="neutral">engine {selected.engineVersion}</Badge>}>
      <div className="space-y-2">
        <RunSelect label="Run" value={selectedRun.id} runs={runs} onChange={(id) => id && onSelect(id)} />
        <RunSelect label="Compare with" value={compareRun?.id ?? null} runs={runs} none="No comparison" onChange={onCompare} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <Badge tone={selectedRun.paymentSlowdown === 1 ? "ok" : "warn"}>{selectedRun.paymentSlowdown === 1 ? "Healthy" : `Payment ${selectedRun.paymentSlowdown}× slower`}</Badge>
        {isDefaultScenario(selectedRun.scenario) ? null : (
          <Badge tone="replay" title={describeNumbers(selectedRun.scenario)}>
            Custom numbers
          </Badge>
        )}
        <Badge>seed {selectedRun.seed}</Badge>
        <Badge>{describeKnobs(selectedRun.knobs)}</Badge>
        <Badge tone={selectedRun.source === "agent" ? "accent" : "neutral"}>{selectedRun.source === "agent" ? "agent run" : "manual run"}</Badge>
      </div>

      {mismatch ? (
        <p className="mt-3 rounded-md border border-warn/40 bg-warn/5 p-2 text-xs text-warn" role="status">
          Not comparable: these runs differ in seed, fault or numbers, so no deltas are shown. Only knob values may differ between compared runs.
        </p>
      ) : null}

      <table className="mt-3 w-full text-left text-xs">
        <caption className="sr-only">Metrics for {selectedRun.id}</caption>
        <thead className="text-muted">
          <tr>
            <th className="py-1 font-medium">Metric</th>
            <th className="py-1 text-right font-medium">{selectedRun.id}</th>
            {comparable ? <th className="py-1 text-right font-medium">{compareRun?.id}</th> : null}
            {comparable ? <th className="py-1 text-right font-medium">Change</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const base = baseRows?.find((b) => b.key === row.key);
            return (
              <tr key={row.key} className="border-t border-border">
                <th scope="row" className="py-1.5 pr-2 font-normal">
                  {row.label}
                </th>
                <td className="num py-1.5 text-right font-medium">{row.display}</td>
                {comparable ? <td className="num py-1.5 text-right text-muted">{base?.display ?? "n/a"}</td> : null}
                {comparable ? (
                  <td className="num py-1.5 text-right">
                    <Delta row={row} base={base} />
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 text-[11px] text-muted">
        Degraded responses are not errors, but they are not full successes either. Read the two rates together.
      </p>

      <details className="mt-3 text-xs">
        <summary className="cursor-pointer text-muted">Per-node detail</summary>
        <table className="mt-2 w-full text-left">
          <thead className="text-muted">
            <tr>
              <th className="py-1 font-medium">Node</th>
              <th className="py-1 text-right font-medium">Slots busy</th>
              <th className="py-1 text-right font-medium">Avg queue</th>
              <th className="py-1 text-right font-medium">Peak queue</th>
              <th className="py-1 text-right font-medium">Rejected</th>
            </tr>
          </thead>
          <tbody>
            {NODE_IDS.map((id) => {
              const n = selected.nodes[id];
              return (
                <tr key={id} className="border-t border-border">
                  <td className="py-1">{LABEL[id]}</td>
                  <td className="num py-1 text-right">{fmtRate(n.occupiedSlotFraction)}</td>
                  <td className="num py-1 text-right">{n.timeWeightedQueueDepth.toFixed(1)}</td>
                  <td className="num py-1 text-right">{n.peakQueue}</td>
                  <td className="num py-1 text-right">{n.rejected}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-2 text-muted">
          Slots busy includes time waiting on downstream calls; it is not CPU utilization. Latency is for succeeded requests only (p95 {fmtMs(selected.latencyMs.p95)}).
        </p>
      </details>

      <div className="mt-3 rounded-md border border-warn/40 bg-warn/5 p-2.5 text-xs">
        <p className="font-semibold text-warn">Scope</p>
        <p className="mt-0.5">These numbers describe a template model with assumed capacities and service times, not your system. Measure real latency and capacity before using them to make a capacity decision.</p>
      </div>
      <p className="num mt-2 break-all text-[10px] text-muted">run hash {selected.runHash}</p>
    </Card>
  );
}
