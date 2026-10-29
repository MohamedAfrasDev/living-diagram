import { describe, expect, test } from "vitest";
import { LIVE_AGENT_OFF_REASON, isReplayOnly, liveAgentDisabledReason } from "./hosting";

describe("replay-only flag", () => {
  test("is on only for an explicit 1 or true", () => {
    for (const on of ["1", "true", "TRUE", " 1 "]) expect(isReplayOnly(on)).toBe(true);
    for (const off of [undefined, "", "0", "false", "no", "yes", "2"]) expect(isReplayOnly(off)).toBe(false);
  });

  test("the disabled reason is shown only when replay-only, and tells the user what to do", () => {
    expect(liveAgentDisabledReason(false)).toBeNull();
    const reason = liveAgentDisabledReason(true);
    expect(reason).toBe(LIVE_AGENT_OFF_REASON);
    expect(reason).toMatch(/hosted/i);
    expect(reason).toMatch(/locally/i);
    expect(reason).toMatch(/replay/i);
  });
});
