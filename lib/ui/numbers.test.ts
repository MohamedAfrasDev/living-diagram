import { describe, expect, test } from "vitest";
import { DEFAULT_SCENARIO, isDefaultScenario } from "../engine/scenario";
import { describeNumbers, draftFromScenario, fieldLabel, scenarioFromDraft } from "./numbers";

describe("the draft behind the Your numbers form", () => {
  test("is built from a scenario as plain strings", () => {
    const d = draftFromScenario(DEFAULT_SCENARIO);
    expect(d.nodes.payment).toEqual({ concurrency: "10", queueCapacity: "20", localMs: "20" });
    expect(d.nodes.cache.queueCapacity).toBe("0");
    expect(d.arrivalIntervalMs).toBe("20");
    expect(d.cacheMissPercent).toBe("25");
    expect(d.faultFactor).toBe("20");
  });

  test("round-trips the default exactly", () => {
    const r = scenarioFromDraft(draftFromScenario(DEFAULT_SCENARIO));
    expect(r.ok).toBe(true);
    if (r.ok) expect(isDefaultScenario(r.scenario)).toBe(true);
  });

  test("an edited draft gives a scenario with that number changed and nothing else", () => {
    const d = draftFromScenario(DEFAULT_SCENARIO);
    d.nodes.payment.concurrency = "12";
    d.arrivalIntervalMs = "40";
    d.cacheMissPercent = "30";
    const r = scenarioFromDraft(d);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.scenario.nodes.payment.concurrency).toBe(12);
      expect(r.scenario.nodes.payment.queueCapacity).toBe(20);
      expect(r.scenario.arrivalIntervalMs).toBe(40);
      expect(r.scenario.cacheMissRate).toBe(0.3);
      expect(r.scenario.nodes.order).toEqual(DEFAULT_SCENARIO.nodes.order);
      expect(isDefaultScenario(r.scenario)).toBe(false);
    }
  });

  test("empty, non-numeric and fractional entries are errors that name the field in plain words", () => {
    const cases: [(d: ReturnType<typeof draftFromScenario>) => void, string][] = [
      [(d) => void (d.nodes.payment.concurrency = ""), "Payment workers"],
      [(d) => void (d.nodes.order.queueCapacity = "abc"), "Order queue"],
      [(d) => void (d.nodes.db.localMs = "1.5"), "DB time per request"],
      [(d) => void (d.arrivalIntervalMs = "5"), "Request interval"],
      [(d) => void (d.cacheMissPercent = "25.5"), "Cache miss rate"],
      [(d) => void (d.cacheMissPercent = "101"), "Cache miss rate"],
      [(d) => void (d.faultFactor = "1"), "Fault factor"],
    ];
    for (const [mutate, label] of cases) {
      const d = draftFromScenario(DEFAULT_SCENARIO);
      mutate(d);
      const r = scenarioFromDraft(d);
      expect(r.ok, label).toBe(false);
      if (!r.ok) expect(r.message, label).toContain(label);
    }
  });

  test("an out-of-range number is an error that states the bounds, never a corrected value", () => {
    const d = draftFromScenario(DEFAULT_SCENARIO);
    d.nodes.payment.concurrency = "1000";
    const r = scenarioFromDraft(d);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/Payment workers.*1.*500/);
  });

  test("whitespace around a number is tolerated, a blank is not", () => {
    const d = draftFromScenario(DEFAULT_SCENARIO);
    d.nodes.payment.concurrency = " 14 ";
    expect(scenarioFromDraft(d).ok).toBe(true);
    d.nodes.payment.concurrency = "   ";
    expect(scenarioFromDraft(d).ok).toBe(false);
  });
});

describe("labels", () => {
  test("every field has a plain label", () => {
    expect(fieldLabel("nodes.payment.concurrency")).toBe("Payment workers");
    expect(fieldLabel("nodes.gateway.queueCapacity")).toBe("Gateway queue");
    expect(fieldLabel("nodes.db.localMs")).toBe("DB time per request");
    expect(fieldLabel("arrivalIntervalMs")).toBe("Request interval");
    expect(fieldLabel("cacheMissRate")).toBe("Cache miss rate");
    expect(fieldLabel("faultFactor")).toBe("Fault factor");
    expect(fieldLabel("something.else")).toBe("something.else");
  });

  test("describeNumbers says template, or lists only what differs", () => {
    expect(describeNumbers(DEFAULT_SCENARIO)).toBe("template numbers");
    const d = draftFromScenario(DEFAULT_SCENARIO);
    d.nodes.payment.concurrency = "12";
    d.arrivalIntervalMs = "40";
    const r = scenarioFromDraft(d);
    if (!r.ok) throw new Error("expected ok");
    expect(describeNumbers(r.scenario)).toBe("Payment workers 12, request interval 40 ms");
  });
});
