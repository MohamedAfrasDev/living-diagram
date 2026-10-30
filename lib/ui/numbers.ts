// The Your numbers form: a draft of strings the user types, turned into a
// validated Scenario (docs/10-your-numbers.md). Nothing is corrected silently:
// an out-of-range number is an error that states the bounds.
import { DEFAULT_SCENARIO, NODE_IDS, validateScenario, type NodeId, type Scenario } from "../engine/scenario";

export interface NodeDraft {
  concurrency: string;
  queueCapacity: string;
  localMs: string;
}

export interface ScenarioDraft {
  nodes: Record<NodeId, NodeDraft>;
  arrivalIntervalMs: string;
  // Whole percent, as the form shows it; the scenario stores a rate from 0 to 1.
  cacheMissPercent: string;
  faultFactor: string;
}

const NODE_LABEL: Record<NodeId, string> = { gateway: "Gateway", order: "Order", cache: "Cache", payment: "Payment", db: "DB" };
const NODE_FIELDS = ["concurrency", "queueCapacity", "localMs"] as const;
const NODE_FIELD_LABEL: Record<(typeof NODE_FIELDS)[number], string> = { concurrency: "workers", queueCapacity: "queue", localMs: "time per request" };

export function draftFromScenario(s: Scenario): ScenarioDraft {
  const node = (id: NodeId): NodeDraft => ({
    concurrency: String(s.nodes[id].concurrency),
    queueCapacity: String(s.nodes[id].queueCapacity),
    localMs: String(s.nodes[id].localMs),
  });
  return {
    nodes: { gateway: node("gateway"), order: node("order"), cache: node("cache"), payment: node("payment"), db: node("db") },
    arrivalIntervalMs: String(s.arrivalIntervalMs),
    cacheMissPercent: String(Math.round(s.cacheMissRate * 100)),
    faultFactor: String(s.faultFactor),
  };
}

// "nodes.payment.concurrency" becomes "Payment workers", and so on.
export function fieldLabel(field: string): string {
  const m = /^nodes\.(gateway|order|cache|payment|db)\.(concurrency|queueCapacity|localMs)$/.exec(field);
  if (m) return `${NODE_LABEL[m[1] as NodeId]} ${NODE_FIELD_LABEL[m[2] as (typeof NODE_FIELDS)[number]]}`;
  if (field === "arrivalIntervalMs") return "Request interval";
  if (field === "cacheMissRate") return "Cache miss rate";
  if (field === "faultFactor") return "Fault factor";
  return field;
}

// A blank or non-numeric entry becomes NaN, which the validator rejects.
const toNumber = (text: string): number => (text.trim() === "" ? NaN : Number(text));

export type DraftCheck = { ok: true; scenario: Scenario } | { ok: false; field: string; message: string };

export function scenarioFromDraft(d: ScenarioDraft): DraftCheck {
  const nodes: Record<string, { concurrency: number; queueCapacity: number; localMs: number }> = {};
  for (const id of NODE_IDS) {
    nodes[id] = {
      concurrency: toNumber(d.nodes[id].concurrency),
      queueCapacity: toNumber(d.nodes[id].queueCapacity),
      localMs: toNumber(d.nodes[id].localMs),
    };
  }
  const percent = toNumber(d.cacheMissPercent);
  const checked = validateScenario({
    nodes,
    arrivalIntervalMs: toNumber(d.arrivalIntervalMs),
    cacheMissRate: Number.isInteger(percent) ? percent / 100 : NaN,
    faultFactor: toNumber(d.faultFactor),
  });
  if (checked.ok) return { ok: true, scenario: checked.scenario };
  const label = fieldLabel(checked.field);
  const message = checked.field === "cacheMissRate" ? "must be a whole number of percent from 0 to 100" : checked.message;
  return { ok: false, field: checked.field, message: `${label} ${message}` };
}

// "template numbers", or only what differs from the template.
export function describeNumbers(s: Scenario): string {
  const parts: string[] = [];
  for (const id of NODE_IDS) {
    for (const f of NODE_FIELDS) {
      if (s.nodes[id][f] !== DEFAULT_SCENARIO.nodes[id][f]) {
        parts.push(`${NODE_LABEL[id]} ${NODE_FIELD_LABEL[f]} ${s.nodes[id][f]}${f === "localMs" ? " ms" : ""}`);
      }
    }
  }
  if (s.arrivalIntervalMs !== DEFAULT_SCENARIO.arrivalIntervalMs) parts.push(`request interval ${s.arrivalIntervalMs} ms`);
  if (s.cacheMissRate !== DEFAULT_SCENARIO.cacheMissRate) parts.push(`cache miss ${Math.round(s.cacheMissRate * 100)} percent`);
  if (s.faultFactor !== DEFAULT_SCENARIO.faultFactor) parts.push(`fault factor ${s.faultFactor}x`);
  return parts.length === 0 ? "template numbers" : parts.join(", ");
}
