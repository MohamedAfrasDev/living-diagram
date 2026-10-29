"use client";

// The architecture canvas. It draws one TimelineSample from a real engine run
// (busy slots and queue depth per node, the breaker state), so the animation
// is evidence, not decoration. Full state is also available as a table.
import { NODE_IDS, NODES, type NodeId } from "@/lib/engine/scenario";
import type { TimelineSample } from "@/lib/engine/simulate";
import { fmtCount } from "@/lib/ui/format";

const LABEL: Record<NodeId, string> = { gateway: "Gateway", order: "Order", cache: "Cache", payment: "Payment", db: "DB" };
const BOX = { w: 150, h: 90 };
const POS: Record<NodeId, { x: number; y: number }> = {
  gateway: { x: 6, y: 138 },
  order: { x: 190, y: 138 },
  cache: { x: 404, y: 14 },
  payment: { x: 404, y: 138 },
  db: { x: 404, y: 262 },
};
const GAUGE_W = BOX.w - 24;

function Gauge({ x, y, value, max, full, label }: { x: number; y: number; value: number; max: number; full: boolean; label: string }) {
  const w = max === 0 ? 0 : Math.min(1, value / max) * GAUGE_W;
  return (
    <g>
      <text x={x} y={y - 4} className="fill-muted text-[11px]">
        {label} <tspan className="num fill-foreground font-medium">{value}/{max}</tspan>
        {full ? <tspan className="fill-danger font-semibold"> FULL</tspan> : null}
      </text>
      <rect x={x} y={y} width={GAUGE_W} height={7} rx={3.5} className="fill-surface-2" />
      <rect x={x} y={y} width={w} height={7} rx={3.5} className={full ? "fill-danger" : "fill-accent"} />
    </g>
  );
}

function Edge({ d, dashed = false }: { d: string; dashed?: boolean }) {
  return <path d={d} fill="none" strokeWidth={1.5} strokeDasharray={dashed ? "4 4" : undefined} className="stroke-muted" markerEnd="url(#arrow)" />;
}

export function Canvas({
  sample,
  paymentSlowdown,
  breakerEnabled,
}: {
  sample: TimelineSample;
  paymentSlowdown: 1 | 20;
  breakerEnabled: boolean;
}) {
  const summary = NODE_IDS.map((id) => `${LABEL[id]} ${sample.nodes[id].busy} of ${NODES[id].concurrency} slots, queue ${sample.nodes[id].queue} of ${NODES[id].queueCapacity}`).join("; ");
  return (
    <div>
      <svg viewBox="0 0 566 368" className="h-auto w-full" role="img" aria-label={`Architecture at ${sample.t} ms. ${summary}. Circuit breaker ${breakerEnabled ? sample.breaker : "off"}.`}>
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0 0L10 5L0 10z" className="fill-muted" />
          </marker>
        </defs>
        <Edge d="M156 183 H190" />
        <Edge d="M340 160 C372 160 372 59 404 59" />
        <Edge d="M340 183 H404" />
        <Edge d="M340 206 C372 206 372 307 404 307" dashed />
        <Edge d="M479 228 V262" />
        <text x={346} y={330} className="fill-muted text-[10px]">
          read on
        </text>
        <text x={346} y={342} className="fill-muted text-[10px]">
          cache miss
        </text>
        {NODE_IDS.map((id) => {
          const { x, y } = POS[id];
          const s = sample.nodes[id];
          const spec = NODES[id];
          const slotsFull = s.busy >= spec.concurrency;
          const queueFull = spec.queueCapacity > 0 && s.queue >= spec.queueCapacity;
          const hot = slotsFull || queueFull;
          return (
            <g key={id}>
              <rect x={x} y={y} width={BOX.w} height={BOX.h} rx={10} strokeWidth={hot ? 2 : 1} className={`fill-surface ${hot ? "stroke-danger" : "stroke-border"}`} />
              <text x={x + 12} y={y + 22} className="fill-foreground text-[15px] font-semibold">
                {LABEL[id]}
              </text>
              {id === "payment" && paymentSlowdown === 20 ? (
                <g>
                  <rect x={x + 86} y={y + 6} width={58} height={18} rx={9} className="fill-warn/15 stroke-warn" strokeWidth={1} />
                  <text x={x + 115} y={y + 19} textAnchor="middle" className="fill-warn text-[10px] font-semibold">
                    20× slower
                  </text>
                </g>
              ) : null}
              <Gauge x={x + 12} y={y + 46} value={s.busy} max={spec.concurrency} full={slotsFull} label="slots" />
              {spec.queueCapacity > 0 ? (
                <Gauge x={x + 12} y={y + 72} value={s.queue} max={spec.queueCapacity} full={queueFull} label="queue" />
              ) : (
                <text x={x + 12} y={y + 78} className="fill-muted text-[11px]">
                  no queue
                </text>
              )}
            </g>
          );
        })}
        <g transform="translate(190 240)">
          <rect width={150} height={26} rx={13} strokeWidth={1} className={breakerEnabled ? (sample.breaker === "closed" ? "fill-ok/10 stroke-ok" : "fill-danger/10 stroke-danger") : "fill-surface-2 stroke-border"} />
          <text x={75} y={17} textAnchor="middle" className={`text-[12px] font-medium ${breakerEnabled ? (sample.breaker === "closed" ? "fill-ok" : "fill-danger") : "fill-muted"}`}>
            {breakerEnabled ? `Breaker: ${sample.breaker}` : "Breaker: off"}
          </text>
        </g>
      </svg>
      <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
        {(
          [
            ["Succeeded", sample.outcomes.succeeded, "text-ok"],
            ["Degraded", sample.outcomes.degraded, "text-warn"],
            ["Failed", sample.outcomes.failed, "text-danger"],
          ] as const
        ).map(([label, value, tone]) => (
          <div key={label} className="rounded-lg border border-border bg-surface-2 px-2 py-1.5">
            <dt className="text-[11px] text-muted">{label} so far</dt>
            <dd className={`num text-lg font-semibold ${tone}`}>{fmtCount(value)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function NodeTable({ sample }: { sample: TimelineSample }) {
  return (
    <table className="w-full text-left text-xs">
      <caption className="sr-only">Node state at {sample.t} ms of simulated time</caption>
      <thead className="text-muted">
        <tr>
          <th className="py-1 font-medium">Node</th>
          <th className="py-1 font-medium">Busy slots</th>
          <th className="py-1 font-medium">Queue</th>
        </tr>
      </thead>
      <tbody>
        {NODE_IDS.map((id) => (
          <tr key={id} className="border-t border-border">
            <td className="py-1">{LABEL[id]}</td>
            <td className="num py-1">
              {sample.nodes[id].busy} / {NODES[id].concurrency}
              {sample.nodes[id].busy >= NODES[id].concurrency ? " (full)" : ""}
            </td>
            <td className="num py-1">
              {sample.nodes[id].queue} / {NODES[id].queueCapacity}
              {NODES[id].queueCapacity > 0 && sample.nodes[id].queue >= NODES[id].queueCapacity ? " (full)" : ""}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
