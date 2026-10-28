# Decision Log

Append-only. Add a dated line; never edit history. If a spec is silent, add a question here instead of choosing.
Status: `proposed` (needs Afras OK), `accepted`, `open` (question), `superseded by D-nnn`.

| ID | Date | Decision / question | Status |
| --- | --- | --- | --- |
| D-001 | 2026-10-28 | Sketch/image import is cut unless the Day-1 spike (`02-rules-and-spike.md`) shows the model accepts images. Default: cut. | proposed |
| D-002 | 2026-10-28 | Engine and agent code live in `lib/engine` and `lib/agent`; the engine never imports the agent. Test runner: vitest (`npm test`). | proposed |
| D-003 | 2026-10-28 | A node's slot is held only for its local time, then released before the request moves downstream (no blocking synchronous call). Latency is the sum of waits plus local times. Network delay between nodes is 0 ms. | proposed |
| D-004 | 2026-10-28 | The "cancellations" slot in the same-timestamp event order is reserved but empty in the MVP. Run cancellation is a harness action between events, not an in-model event. A model requesting per-request cancellation returns `UNSUPPORTED_CANCELLATION`. | proposed |
| D-005 | 2026-10-28 | Round-robin skips replicas that are down; if all are down the request fails `COMPONENT_DOWN`. A full queue never causes re-routing. | proposed |
| D-006 | 2026-10-28 | Topology is a linear chain of tiers; each tier is one node with N identical replicas. Any other shape is unsupported. | proposed |
| D-007 | 2026-10-28 | All scenario numbers are labeled templates (assumptions), not measurements. | proposed |
| D-008 | 2026-10-28 | Judging weights, cutoff in local time, eligible Meta models, license, entrant naming: unconfirmed, see `02-rules-and-spike.md` checklist. | open |
