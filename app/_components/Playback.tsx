"use client";

import { HORIZON_MS } from "@/lib/engine/scenario";
import { Button } from "./ui";

export const SPEEDS = [1, 2, 4] as const;
export type Speed = (typeof SPEEDS)[number];

export function Playback({
  t,
  playing,
  speed,
  disabled,
  onToggle,
  onSeek,
  onSpeed,
  onRestart,
}: {
  t: number;
  playing: boolean;
  speed: Speed;
  disabled: boolean;
  onToggle: () => void;
  onSeek: (t: number) => void;
  onSpeed: (s: Speed) => void;
  onRestart: () => void;
}) {
  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={onToggle} disabled={disabled} label={playing ? "Pause simulation playback" : "Play simulation playback"}>
          {playing ? "Pause" : t >= HORIZON_MS ? "Replay" : "Play"}
        </Button>
        <Button onClick={onRestart} disabled={disabled} label="Restart playback from zero">
          Restart
        </Button>
        <label className="ml-auto flex items-center gap-1.5 text-xs text-muted">
          Speed
          <select
            value={speed}
            onChange={(e) => onSpeed(Number(e.target.value) as Speed)}
            className="rounded-md border border-border bg-surface px-1.5 py-1 text-xs text-foreground"
            aria-label="Playback speed"
          >
            {SPEEDS.map((s) => (
              <option key={s} value={s}>
                {s}×
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={0}
          max={HORIZON_MS}
          step={50}
          value={Math.round(t / 50) * 50}
          disabled={disabled}
          onChange={(e) => onSeek(Number(e.target.value))}
          className="w-full accent-[var(--accent)]"
          aria-label="Simulated time"
          aria-valuetext={`${Math.round(t)} milliseconds of ${HORIZON_MS}`}
        />
        <span className="num w-28 shrink-0 text-right text-xs text-muted">
          t = {Math.round(t).toLocaleString("en-US")} ms
        </span>
      </div>
      <p className="text-[11px] text-muted">Virtual time. The animation replays the engine&apos;s own recorded node state; it is not a separate model.</p>
    </div>
  );
}
