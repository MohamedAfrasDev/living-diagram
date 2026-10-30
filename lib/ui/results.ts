// Engine results for runs shown in the interface, cached by everything that
// determines a result. The key MUST include the scenario: two runs with the same
// seed, settings and fault but different numbers are different runs, and showing
// one's result for the other would put wrong numbers on screen.
import { canonicalScenario } from "../engine/scenario";
import { simulate, type SimulationResult } from "../engine/simulate";
import { runInput, type UiRun } from "./runs";

const cache = new Map<string, SimulationResult>();

// Run id and source are not part of the key: they do not change the result.
export function runCacheKey(run: UiRun): string {
  return JSON.stringify([run.seed, run.knobs, run.paymentSlowdown, canonicalScenario(run.scenario)]);
}

// The engine result for a run, with the canvas timeline. Pure and deterministic.
export function resultFor(run: UiRun): SimulationResult {
  const key = runCacheKey(run);
  let hit = cache.get(key);
  if (!hit) {
    hit = simulate(runInput(run, true));
    cache.set(key, hit);
  }
  return hit;
}
