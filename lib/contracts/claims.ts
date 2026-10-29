// Claim and statement contracts (docs/03-agent-and-tools.md section 5). Types
// only, so this module has no runtime imports.
import type { KnobField } from "./tools";

// Every numeric token in a statement must be backed by one of these references.
export type NumberRef =
  | { token: string; kind: "metric"; path: string } // path is "run-3.errorRate"
  | { token: string; kind: "knob"; runId: string; field: KnobField }
  | { token: string; kind: "seed"; runId: string }
  | { token: string; kind: "ratio"; numerator: string; denominator: string } // metric paths
  | { token: string; kind: "difference"; from: string; to: string }; // metric paths, to minus from

export interface Statement {
  text: string;
  numbers: NumberRef[];
  // Required for causal or directional wording; must be a recorded compare call.
  comparison: { runA: string; runB: string } | null;
}

export interface ConcludeArgs {
  claims: Statement[];
  rejectedProposals: Statement[];
  limits: string[];
}

export interface BlockedStatement {
  section: "claims" | "rejectedProposals" | "limits";
  text: string;
  reasons: string[];
}

export interface Conclusion extends ConcludeArgs {
  acceptedAtCall: number;
}
