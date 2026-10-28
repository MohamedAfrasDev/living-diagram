# Engine Semantics Spec

Status: **draft for freeze.** Rules marked (D-nnn) are in `decision-log.md`, status `proposed` until Afras accepts them. The engine is plain TypeScript, tick-based, deterministic, integer milliseconds, with no network or model calls. It never imports the agent package.

## 1. Time and determinism

- One tick is 1 ms. The clock advances tick by tick from 0 to the cutoff `H` (D-004).
- No `Math.random`, `Date` or wall-clock time. The seed feeds a pure seeded generator (mulberry32) defined in the engine. Its only use is choosing which requests miss the cache (25%). Same seed, same result.
- A run is a pure function of `{ seed, knobs, paymentSlowdown }` plus the fixed scenario in doc 04.

## 2. Model

- Topology and numbers are fixed by doc 04. Nodes: Gateway, Order, Cache, Payment, DB.
- Each node has `concurrency` slots, a FIFO queue with `queueCapacity`, and a local time. A request holds one slot for its local time, then calls downstream while still holding the slot (D-003).
- Arrival at a node: if a slot is free, start. Else if the queue has room, enqueue. Else fail `QUEUE_FULL`.
- A request completes successfully only after local work and all required downstream calls succeed.

## 3. Knobs (apply to the Order-to-Payment call only)

- `timeoutMs`: each attempt has a deadline of `timeoutMs` after it starts. On expiry the caller abandons the attempt with `TIMEOUT`. The downstream work is **not** cancelled: it keeps its slot or queue position and its result is discarded (D-006).
- `retries`: up to N extra attempts after `TIMEOUT` or `QUEUE_FULL`, after a fixed 50 ms backoff. The Order slot is held during backoff. `BULKHEAD_FULL` and `CIRCUIT_OPEN` are not retried. Each attempt has an attempt ID; the logical request counts once.
- `bulkhead`: at most N Order-to-Payment attempts in flight. Beyond that the attempt fails immediately with `BULKHEAD_FULL`.
- `circuitBreaker`: fixed parameters. Closed until 5 consecutive Payment attempts fail (`TIMEOUT` or `QUEUE_FULL`); then open for 2,000 ms, during which Order skips Payment and returns a **degraded** response. After 2,000 ms it is half-open and allows one probe: success closes it, failure reopens it for another 2,000 ms. `circuitBreaker` should be used with `retries=0`; the engine does not forbid other combinations.

## 4. Outcomes

Each logical request ends in exactly one state:

- `succeeded`: full success.
- `degraded`: breaker was open and Order returned a degraded response (D-005). It is not an error and not a full success. Always reported separately.
- `failed`: with a code: `QUEUE_FULL`, `TIMEOUT`, `BULKHEAD_FULL`.
- `outstanding`: still in flight at `H`. Never counted as a failure or success.

## 5. Order of events inside one tick

1. Attempt deadlines expire (timeouts), in request-ID order.
2. Completions, in node order DB, Payment, Cache, Order, Gateway, then request ID. A completion releases the slot, starts the head of that node's queue in the same tick, and hands the result to the caller in the same tick.
3. Circuit breaker transitions (open to half-open when the 2,000 ms elapse).
4. New arrivals at Gateway, in request-ID order.

Completions at `H` are processed; events scheduled after `H` are not. This order is frozen by engine version and covered by boundary tests.

## 6. Validation and errors

Returned before any run:

| Condition | Code |
| --- | --- |
| Knob outside the domain in doc 04, unknown field | `INVALID_KNOBS` |
| `paymentSlowdown` not 1 or 20 | `INVALID_FAULT` |
| Run exceeds the event budget (200,000 events) | `RUN_INCOMPLETE` |

## 7. Result shape

| Field | Definition |
| --- | --- |
| `offered` | number of arrivals |
| `succeeded`, `degraded`, `failed`, `outstanding` | counts; they sum to `offered` |
| `errorRate` | `failed / offered`; 0 if offered is 0 |
| `degradedRate` | `degraded / offered` |
| `failuresByCode` | counts per code |
| `latencyMs` | `p50`, `p95`, `max` over succeeded requests only, nearest-rank; unavailable for 0 samples |
| `paymentAttemptsPerRequest` | Payment attempts divided by logical requests |
| `nodes.<id>.occupiedSlotFraction` | busy slot-ms divided by (concurrency times `H`); includes time waiting on downstream |
| `nodes.<id>.timeWeightedQueueDepth` | average queue length over `[0, H)` |
| `nodes.<id>.peakQueue`, `nodes.<id>.rejected` | maximum queue length, rejection count |
| `runHash` | hash of the result, used for replay checks |

Pass and fail thresholds used by the golden test: a healthy scenario **passes** at `errorRate <= 0.05`, a fault **fails** at `errorRate > 0.20` (D-010). A fix is judged by D-017: a good fix halves the fault-alone `errorRate` and reports its degraded share; a bad fix is worse on `paymentAttemptsPerRequest` and `p95`, not necessarily `errorRate`.

## 8. Golden tests (written before engine code)

Definitions follow D-017. The first five tests are in `lib/engine/simulate.test.ts`:

1. Baseline passes (`errorRate <= 5%`, `outstanding = 0`).
2. Fault (payment 20x) fails (`errorRate > 20%`).
3. `retries=3` under the fault still fails (`errorRate > 20%`) and is worse on load (`paymentAttemptsPerRequest` at least 2x the fault alone) and tail latency (`p95` higher), on seeds 1 and 2. A separate test records the finding that retries do not raise `errorRate` here (D-016).
4. `circuitBreaker` with `retries=0` under the fault cuts `errorRate` to at most half of the fault alone (seeds 1 and 2) and reports `degraded > 0` and `degradedRate > 0`. A separate test checks it does not degrade a healthy system.
5. Same seed gives identical results.

Further tests (in `simulate.invariants.test.ts`): occupied slots never exceed concurrency, FIFO order, queue never exceeds capacity, every request is in exactly one outcome state, event times never decrease, no events after `H`, knob domain rejection. Boundary-tick ordering tests are still to be written.
