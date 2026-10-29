// Number formatting and the metric rows shown in the evidence panel. Every
// value shown comes straight from an engine result (rule 4); nothing is derived
// here except display rounding.
import type { SimulationResult } from "../engine/simulate";

export const fmtRate = (v: number): string => `${(v * 100).toFixed(1)}%`;
export const fmtCount = (v: number): string => v.toLocaleString("en-US", { maximumFractionDigits: 0 });
export const fmtMs = (v: number | null): string => (v === null ? "n/a" : `${v.toLocaleString("en-US", { maximumFractionDigits: 0 })} ms`);

export interface MetricRow {
  key: string;
  label: string;
  value: number | null;
  display: string;
  // Whether a higher value is worse, used to colour deltas in the comparison.
  higherIsWorse: boolean | null;
}

// errorRate and degradedRate stay adjacent: a fix that hides failures behind
// degraded responses must show both (D-005).
export function headlineRows(r: SimulationResult): MetricRow[] {
  return [
    { key: "errorRate", label: "Error rate", value: r.errorRate, display: fmtRate(r.errorRate), higherIsWorse: true },
    { key: "degradedRate", label: "Degraded rate", value: r.degradedRate, display: fmtRate(r.degradedRate), higherIsWorse: null },
    { key: "succeeded", label: "Succeeded", value: r.succeeded, display: fmtCount(r.succeeded), higherIsWorse: false },
    { key: "degraded", label: "Degraded", value: r.degraded, display: fmtCount(r.degraded), higherIsWorse: null },
    { key: "failed", label: "Failed", value: r.failed, display: fmtCount(r.failed), higherIsWorse: true },
    { key: "outstanding", label: "Outstanding at cutoff", value: r.outstanding, display: fmtCount(r.outstanding), higherIsWorse: true },
    {
      key: "paymentAttemptsPerRequest",
      label: "Payment attempts per request",
      value: r.paymentAttemptsPerRequest,
      display: r.paymentAttemptsPerRequest.toFixed(2),
      higherIsWorse: true,
    },
    { key: "latencyMs.p95", label: "p95 latency (succeeded)", value: r.latencyMs.p95, display: fmtMs(r.latencyMs.p95), higherIsWorse: true },
  ];
}
