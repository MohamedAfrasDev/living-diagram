# Scenario: Slow Payment

Every number below is a **template assumption** (D-008), fixed before the first golden-test run. None is a measurement. Time unit: whole milliseconds. If the golden test fails under these numbers, report that and log a decision; do not tune silently.

## Topology (fixed, read-only)

`client -> Gateway -> Order -> (Cache, then DB on a miss) -> Payment -> DB`

| Node | Concurrency | Queue capacity | Local time |
| --- | --- | --- | --- |
| Gateway | 100 | 100 | 2 ms |
| Order | 50 | 40 | 5 ms |
| Cache | 50 | 0 | 1 ms |
| Payment | 10 | 20 | 20 ms (times the slowdown) |
| DB | 20 | 40 | 10 ms |

A request visits Gateway, then Order. Order calls Cache. On a cache miss (25% of requests, chosen by the seeded generator in doc 05) Order calls DB for a read. Order then calls Payment, which calls DB for a write. Callers hold their slot while waiting (D-003). Network delay between nodes is 0 ms.

## Workload (persisted, explicit)

- One logical request every 20 ms from t = 0 to t = 9,980 (500 requests, 50 per second). Changed from 10 ms and Order 20 slots by D-015 option A.
- Cutoff H = 15,000 ms (a 5,000 ms drain window). Requests still in flight at H are `outstanding`.

## Fault

Payment local time is multiplied by 20 for the whole run (`paymentSlowdown = 20`).

## Hand arithmetic (sanity checks, not results)

- Baseline Payment hold time = 20 + 10 = 30 ms. Payment ceiling = 10 slots / 0.030 s, about 333 per second, against 100 offered. Order hold time is about 38 ms, so about 4 of 20 Order slots are in use. The system is healthy.
- **Correction (D-014):** the next bullet assumed Payment's queue fills. With Order concurrency 20 (below Payment's 10 slots plus 20 queue) Order saturates first, so the first engine run showed no timeouts and the knobs had no effect. This scenario is under review; see D-014 and D-015.
- Under the fault, Payment hold time = 400 + 10 = 410 ms. Payment ceiling = 10 / 0.410 s, about 24 per second, against 100 offered. The Payment queue (20) fills, extra calls fail `QUEUE_FULL`, and queued calls wait up to about 820 ms before a 410 ms service, so some exceed a 1,000 ms timeout.
- Observed behavior (D-016, D-017; tests enforce it): with `retries=3`, retried and abandoned attempts multiply downstream load (about 4 Payment attempts per request) and stretch p95 latency, but do not raise `errorRate`; retries even recover a few more requests. With the circuit breaker and `retries=0`, Order stops calling Payment after repeated failures and returns degraded responses, which cuts `errorRate` by more than half at the cost of a large degraded share.

## Knob domains (validated; out-of-range is rejected)

| Knob | Type and range | Default |
| --- | --- | --- |
| `timeoutMs` | integer 50 to 5,000 | 1,000 |
| `retries` | integer 0 to 5 | 0 |
| `circuitBreaker` | boolean | false |
| `bulkhead` | integer 1 to 20, or null (off) | null |

## Intended learning moments

1. Fault alone: the system fails and the metrics show why (Payment saturated, Order slots held).
2. Plausible but not helpful: `retries=3` does not lower errors, and it multiplies Payment load and tail latency (do not claim it raises the error rate; D-016).
3. Plausible but ineffective: `bulkhead` or a shorter timeout fails fast but does not fix error rate.
4. Working fix: `circuitBreaker` with `retries=0`, reported with its `degraded` count so the tradeoff is visible.

## Rules for adding a scenario

- Arrival traces are explicit or an integer interval. Randomness only through the seeded generator in doc 05.
- Every number is in this document or labeled as an assumption.
