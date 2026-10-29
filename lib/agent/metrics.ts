// Flattens an engine result into dotted metric paths. These paths are the only
// numbers an agent claim may cite (docs/03 section 5).
import { NODE_IDS } from "../engine/scenario";
import type { SimulationResult } from "../engine/simulate";

export type MetricValue = number | null;

export const HEADLINE_PATHS = [
  "offered",
  "succeeded",
  "degraded",
  "failed",
  "outstanding",
  "errorRate",
  "degradedRate",
  "paymentAttemptsPerRequest",
  "latencyMs.p95",
] as const;

export function flattenMetrics(r: SimulationResult): Record<string, MetricValue> {
  const flat: Record<string, MetricValue> = {
    offered: r.offered,
    succeeded: r.succeeded,
    degraded: r.degraded,
    failed: r.failed,
    outstanding: r.outstanding,
    errorRate: r.errorRate,
    degradedRate: r.degradedRate,
    paymentAttemptsPerRequest: r.paymentAttemptsPerRequest,
    "latencyMs.p50": r.latencyMs.p50,
    "latencyMs.p95": r.latencyMs.p95,
    "latencyMs.max": r.latencyMs.max,
    "latencyMs.samples": r.latencyMs.samples,
  };
  for (const [code, count] of Object.entries(r.failuresByCode)) flat[`failuresByCode.${code}`] = count;
  for (const id of NODE_IDS) {
    const n = r.nodes[id];
    flat[`nodes.${id}.occupiedSlotFraction`] = n.occupiedSlotFraction;
    flat[`nodes.${id}.timeWeightedQueueDepth`] = n.timeWeightedQueueDepth;
    flat[`nodes.${id}.peakQueue`] = n.peakQueue;
    flat[`nodes.${id}.rejected`] = n.rejected;
  }
  return flat;
}
