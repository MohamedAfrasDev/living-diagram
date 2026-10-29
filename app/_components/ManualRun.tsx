"use client";

// Manual mode: run the simulator by hand with the four knobs. Works without the
// agent or an API key. Invalid values disable the run button and say why (rule 6).
import { useState } from "react";
import { KNOB_DOMAIN } from "@/lib/engine/scenario";
import { knobsError, type Knobs } from "@/lib/engine/simulate";
import { DEFAULT_KNOBS } from "@/lib/ui/runs";
import { Button, Card } from "./ui";

export function ManualRun({ onRun }: { onRun: (knobs: Knobs, paymentSlowdown: 1 | 20, seed: number) => void }) {
  const [timeoutMs, setTimeoutMs] = useState(String(DEFAULT_KNOBS.timeoutMs));
  const [retries, setRetries] = useState(String(DEFAULT_KNOBS.retries));
  const [breaker, setBreaker] = useState(false);
  const [bulkhead, setBulkhead] = useState("");
  const [fault, setFault] = useState(true);
  const [seed, setSeed] = useState("1");

  const knobs: Knobs = {
    timeoutMs: Number(timeoutMs),
    retries: Number(retries),
    circuitBreaker: breaker,
    bulkhead: bulkhead === "" ? null : Number(bulkhead),
  };
  const seedNumber = Number(seed);
  const error = !Number.isInteger(seedNumber) || seed.trim() === "" ? "seed must be an integer" : knobsError(knobs);
  const field = "mt-0.5 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm";

  return (
    <Card title="Run it by hand">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!error) onRun(knobs, fault ? 20 : 1, seedNumber);
        }}
        className="space-y-3"
      >
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-muted">
            timeoutMs ({KNOB_DOMAIN.timeoutMs.min}–{KNOB_DOMAIN.timeoutMs.max})
            <input className={`${field} num`} inputMode="numeric" value={timeoutMs} onChange={(e) => setTimeoutMs(e.target.value)} />
          </label>
          <label className="text-xs text-muted">
            retries ({KNOB_DOMAIN.retries.min}–{KNOB_DOMAIN.retries.max})
            <select className={field} value={retries} onChange={(e) => setRetries(e.target.value)}>
              {[0, 1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-muted">
            bulkhead
            <select className={field} value={bulkhead} onChange={(e) => setBulkhead(e.target.value)}>
              <option value="">off</option>
              {[1, 2, 3, 4, 5, 8, 10, 15, 20].map((n) => (
                <option key={n} value={n}>
                  {n} in flight
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-muted">
            seed
            <input className={`${field} num`} inputMode="numeric" value={seed} onChange={(e) => setSeed(e.target.value)} />
          </label>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={breaker} onChange={(e) => setBreaker(e.target.checked)} className="accent-[var(--accent)]" />
            Circuit breaker
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={fault} onChange={(e) => setFault(e.target.checked)} className="accent-[var(--accent)]" />
            Payment 20× slower
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" kind="primary" disabled={error !== null}>
            Run simulation
          </Button>
          {error ? (
            <p className="text-xs text-danger" role="alert">
              {error}
            </p>
          ) : (
            <p className="text-xs text-muted">Runs the same deterministic engine the agent uses.</p>
          )}
        </div>
      </form>
    </Card>
  );
}
