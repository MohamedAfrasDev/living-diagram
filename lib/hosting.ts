// Replay-only mode for a hosted copy (docs/06-ui-and-demo.md section 9, D-020).
// A hosted copy must never run the live agent or hold a key. Two switches, both
// off by default: REPLAY_ONLY (server) makes the route refuse every request even
// if a key is present, and NEXT_PUBLIC_REPLAY_ONLY (build time) makes the
// interface disable the live button and say why (rule 6: unsupported means
// disabled, not accepted and ignored).
export const LIVE_AGENT_OFF_REASON =
  "The live agent is switched off on this hosted copy. Run it locally with your own key (see the README), or watch the recorded Replay.";

export function isReplayOnly(value: string | undefined): boolean {
  const v = value?.trim().toLowerCase();
  return v === "1" || v === "true";
}

export function liveAgentDisabledReason(replayOnly: boolean): string | null {
  return replayOnly ? LIVE_AGENT_OFF_REASON : null;
}
