# Engine Semantics Spec

Status: **draft for your freeze.** Rules marked (D-nnn) are proposed in `decision-log.md`. The engine is deterministic: no randomness, no wall clock, integer milliseconds.

## 1. Model

- Topology is a linear chain of tiers: `client -> tier1 -> tier2 -> ... -> tierN` (D-006).
- Each tier has: `id`, `replicas` (integer 1-10), `localTimeMs` (integer >= 1), `concurrency` per replica (integer >= 1), `queueCapacity` per replica (integer >= 0).
- A request visits every tier once, in order. Network delay between tiers is 0 ms.
- Horizon `H` (ms). Arrivals are an explicit list of integer times `0 <= t < H`. Request IDs are assigned `r1, r2, ...` in trace order (ties keep trace order).
- Faults: `{ tier, replica | "all", startMs, endMs }`; a replica is down on `[startMs, endMs)`.

## 2. Per-replica behavior

1. **Arrival at a replica:** if down, fail `COMPONENT_DOWN`. Else if a slot is free, start service. Else if queue length < `queueCapacity`, append to the FIFO queue. Else fail `QUEUE_FULL`.
2. **Service** holds one slot for exactly `localTimeMs`. On completion the slot is released, the head of the queue (if any) starts at the same timestamp, and the finished request moves to the next tier (D-003). After the last tier the request succeeds, and its latency = completion time − arrival time (queue waits included).
3. **Fault start:** the replica goes down. Every request in service or queued there fails `COMPONENT_DOWN` at `startMs`, and slots and queue are emptied.
4. **Fault end:** the replica is up and empty at `endMs`.

## 3. Round-robin routing (D-005)

Each tier keeps a pointer `p`, initially 0. For a request entering the tier: scan replicas `p, p+1, ... (mod n)`; pick the first that is up at that instant, set `p = (picked + 1) mod n`. If none is up, fail `COMPONENT_DOWN`. Request 1 goes to replica 0, request 2 to replica 1, and so on, when all are up. A full queue does not re-route; it fails `QUEUE_FULL`.

## 4. Event order at the same timestamp

1. Cancellations (reserved, always empty in the MVP; D-004)
2. Fault changes (ends before starts at the same timestamp, then by tier order, then replica index)
3. Completions (by tier order, replica index, then request ID)
4. Arrivals (by request ID)

Completions at the cutoff time `H` are processed; events scheduled after `H` are not.

## 5. Metrics (denominators explicit)

- `offered` = number of arrivals in the trace.
- `succeeded`, `failed` (by code: `COMPONENT_DOWN`, `QUEUE_FULL`).
- `outstanding` = offered − succeeded − failed at `H`. Never counted as failures.
- `successRate` = `succeeded / offered` (0 if offered is 0).
- Latency percentiles over succeeded requests only, nearest-rank: value at index `ceil(p/100 * n)` of the sorted list (1-based). Report p50, p95, max.
- `throughputPerSec` = `succeeded / (H / 1000)`.
- `utilization` per tier = total busy slot-ms (clipped at `H`) / (replicas × concurrency × H).
- `peakQueue` per replica = max queue length observed.

## 6. Unsupported features and their errors

Returned at model validation, before any run. The UI disables these controls.

| Feature | Error code |
| --- | --- |
| Retries | `UNSUPPORTED_RETRIES` |
| Parallel or fan-out calls (a tier with more than one downstream tier) | `UNSUPPORTED_PARALLEL_CALLS` |
| Cycles | `UNSUPPORTED_CYCLE` |
| Per-request cancellation | `UNSUPPORTED_CANCELLATION` |
| Random arrivals | `UNSUPPORTED_STOCHASTIC_ARRIVALS` |
| Arrival time outside `[0, H)`, non-integer times | `INVALID_ARRIVAL` |

## 7. Open points for your freeze

- D-003 (non-blocking handoff) is the biggest modeling choice; a blocking call would make the API slots a bottleneck during a db outage or overload.
- D-004 (empty cancellation slot) departs slightly from the source doc's event-order list.
