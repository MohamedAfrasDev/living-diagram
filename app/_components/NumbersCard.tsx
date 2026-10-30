"use client";

// Your numbers (docs/10-your-numbers.md): the developer enters their own
// workers, queue sizes and timings for the same five services, plus the request
// rate, the cache miss rate and how much slower Payment gets under the fault.
// These are inputs, not measurements. Invalid entries are errors that state the
// bounds; nothing is corrected silently, and the run buttons stay disabled until
// the numbers are valid.
import { useState } from "react";
import { DEFAULT_SCENARIO, NODE_IDS, SCENARIO_BOUNDS, arrivalCount, isDefaultScenario, type NodeId, type Scenario } from "@/lib/engine/scenario";
import { applyToDraft, describeNumbers, draftFromScenario, scenarioFromDraft, type NodeDraft, type ScenarioDraft } from "@/lib/ui/numbers";
import { IncidentText } from "./IncidentText";
import { Badge, Button, Card } from "./ui";

const LABEL: Record<NodeId, string> = { gateway: "Gateway", order: "Order", cache: "Cache", payment: "Payment", db: "DB" };
const COLUMNS = [
  { key: "concurrency", title: "Workers", suffix: "workers" },
  { key: "queueCapacity", title: "Queue", suffix: "queue" },
  { key: "localMs", title: "ms each", suffix: "time per request in ms" },
] as const;

const input = "num w-full rounded-md border bg-surface px-2 py-1 text-sm";

export function NumbersCard({ onChange, incidentOffReason }: { onChange: (scenario: Scenario | null) => void; incidentOffReason: string | null }) {
  const [draft, setDraft] = useState<ScenarioDraft>(() => draftFromScenario(DEFAULT_SCENARIO));
  const check = scenarioFromDraft(draft);
  const custom = check.ok && !isDefaultScenario(check.scenario);

  // Every edit goes through here so the parent always has the latest valid
  // numbers, or null while the form is invalid.
  const update = (next: ScenarioDraft) => {
    setDraft(next);
    const c = scenarioFromDraft(next);
    onChange(c.ok ? c.scenario : null);
  };
  const setNode = (id: NodeId, key: keyof NodeDraft, value: string) => update({ ...draft, nodes: { ...draft.nodes, [id]: { ...draft.nodes[id], [key]: value } } });
  const reset = () => update(draftFromScenario(DEFAULT_SCENARIO));

  const bad = (field: string) => !check.ok && check.field === field;
  const border = (field: string) => (bad(field) ? "border-danger" : "border-border");

  const interval = Number(draft.arrivalIntervalMs);
  const hint =
    Number.isInteger(interval) && interval >= SCENARIO_BOUNDS.arrivalIntervalMs.min && interval <= SCENARIO_BOUNDS.arrivalIntervalMs.max
      ? `${(1000 / interval).toLocaleString("en-US", { maximumFractionDigits: 1 })} requests per second, ${arrivalCount({ ...DEFAULT_SCENARIO, arrivalIntervalMs: interval })} requests in 10 s`
      : null;

  return (
    <Card title="Your numbers" aside={<Badge tone={custom ? "replay" : check.ok ? "neutral" : "danger"}>{custom ? "Custom" : check.ok ? "Template" : "Invalid"}</Badge>}>
      <details>
        <summary className="cursor-pointer text-sm">
          <span className="font-medium">{check.ok ? describeNumbers(check.scenario) : "Fix the highlighted number"}</span>
          <span className="text-muted"> (click to edit)</span>
        </summary>

        <p className="mt-3 rounded-md border border-warn/40 bg-warn/5 px-3 py-2 text-xs text-warn">
          Numbers you entered. The engine does not measure them; results describe these numbers only.
        </p>

        <table className="mt-3 w-full text-left text-xs">
          <caption className="sr-only">Workers, queue size and time per request for each service</caption>
          <thead className="text-muted">
            <tr>
              <th className="py-1 pr-2 font-medium">Service</th>
              {COLUMNS.map((c) => (
                <th key={c.key} className="px-1 py-1 font-medium">
                  {c.title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {NODE_IDS.map((id) => (
              <tr key={id} className="border-t border-border">
                <th scope="row" className="py-1.5 pr-2 font-normal">
                  {LABEL[id]}
                </th>
                {COLUMNS.map((c) => (
                  <td key={c.key} className="px-1 py-1.5">
                    <input
                      className={`${input} ${border(`nodes.${id}.${c.key}`)}`}
                      inputMode="numeric"
                      value={draft.nodes[id][c.key]}
                      onChange={(e) => setNode(id, c.key, e.target.value)}
                      aria-label={`${LABEL[id]} ${c.suffix}`}
                      aria-invalid={bad(`nodes.${id}.${c.key}`)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-3 grid grid-cols-3 gap-3">
          <label className="text-xs text-muted">
            A request every (ms)
            <input className={`${input} mt-0.5 ${border("arrivalIntervalMs")}`} inputMode="numeric" value={draft.arrivalIntervalMs} onChange={(e) => update({ ...draft, arrivalIntervalMs: e.target.value })} aria-invalid={bad("arrivalIntervalMs")} />
          </label>
          <label className="text-xs text-muted">
            Cache misses (%)
            <input className={`${input} mt-0.5 ${border("cacheMissRate")}`} inputMode="numeric" value={draft.cacheMissPercent} onChange={(e) => update({ ...draft, cacheMissPercent: e.target.value })} aria-invalid={bad("cacheMissRate")} />
          </label>
          <label className="text-xs text-muted">
            Fault: Payment slower by
            <input className={`${input} mt-0.5 ${border("faultFactor")}`} inputMode="numeric" value={draft.faultFactor} onChange={(e) => update({ ...draft, faultFactor: e.target.value })} aria-invalid={bad("faultFactor")} />
          </label>
        </div>
        {hint ? <p className="mt-1 text-[11px] text-muted">{hint}</p> : null}

        <IncidentText offReason={incidentOffReason} onApply={(values) => update(applyToDraft(draft, values))} />

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button onClick={reset} disabled={!custom && check.ok}>
            Reset to template
          </Button>
          {!check.ok ? (
            <p className="text-xs text-danger" role="alert">
              {check.message}. Running is off until this is fixed.
            </p>
          ) : (
            <p className="text-xs text-muted">Bounds: 1 to 500 workers, 0 to 500 queue, 1 to 2,000 ms, a request every 10 to 200 ms, fault 2 to 50 times slower.</p>
          )}
        </div>
      </details>
    </Card>
  );
}
