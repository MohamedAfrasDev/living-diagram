import { describe, expect, test } from "vitest";
import { DEFAULT_SCENARIO } from "../engine/scenario";
import { applyToDraft, draftFromScenario, scenarioFromDraft } from "./numbers";

describe("applyToDraft (Use these numbers)", () => {
  test("replaces only the given fields and leaves the rest as they were", () => {
    const before = draftFromScenario(DEFAULT_SCENARIO);
    const after = applyToDraft(before, { "payment.concurrency": 12, "payment.localMs": 25, arrivalIntervalMs: 17, cacheMissRate: 0.4, faultFactor: 10 });
    expect(after.nodes.payment).toEqual({ concurrency: "12", queueCapacity: "20", localMs: "25" });
    expect(after.arrivalIntervalMs).toBe("17");
    expect(after.cacheMissPercent).toBe("40");
    expect(after.faultFactor).toBe("10");
    expect(after.nodes.gateway).toEqual(before.nodes.gateway);
  });

  test("does not change the draft it was given", () => {
    const before = draftFromScenario(DEFAULT_SCENARIO);
    applyToDraft(before, { "payment.concurrency": 99 });
    expect(before.nodes.payment.concurrency).toBe("10");
  });

  test("the result goes through the normal validation", () => {
    const after = applyToDraft(draftFromScenario(DEFAULT_SCENARIO), { "payment.concurrency": 12, cacheMissRate: 0.07 });
    const check = scenarioFromDraft(after);
    expect(check.ok).toBe(true);
    if (check.ok) {
      expect(check.scenario.nodes.payment.concurrency).toBe(12);
      expect(check.scenario.cacheMissRate).toBe(0.07);
    }
  });

  test("an empty set changes nothing", () => {
    const before = draftFromScenario(DEFAULT_SCENARIO);
    expect(applyToDraft(before, {})).toEqual(before);
  });
});
