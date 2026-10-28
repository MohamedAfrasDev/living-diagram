# Scenario Pack

Every number below is a **template assumption** (D-007), chosen for easy hand arithmetic. None is a measurement. Time unit: whole milliseconds. Horizon H = 10,000 ms. No network delay between tiers (D-003).

## Shared topology: `client -> api -> db`

| Tier | Replicas | Local time | Concurrency per replica | Queue capacity per replica |
| --- | --- | --- | --- | --- |
| api | 2 (outage variant B: 3) | 10 ms | 10 | 20 |
| db | 1 | 50 ms | 1 | 20 |

Database ceiling = 1 slot / 0.05 s = **20 operations per second**. API capacity per replica = 10 / 0.01 s = 1,000 per second (never the bottleneck here).

## Scenario A: database outage

- Arrivals: a request every 100 ms at t = 0, 100, ..., 9,900 (100 requests, 10 per second). Below the db ceiling.
- Fault: `db` down on [4,000, 6,000) ms.
- Expected shape (exact numbers are derived in `06-golden-tests.md`): requests arriving in the window fail `COMPONENT_DOWN`; those before and after succeed with latency 60 ms. Variant B (3 API replicas) changes routing but not the failures, because the db is the single point of failure.
- Teaching point: adding API replicas does not fix a database outage (the "failed fix").

## Scenario B: overload

- Arrivals: a request every 25 ms at t = 0, 25, ..., 9,975 (400 requests, 40 per second).
- No faults.
- Offered 40/s against a db ceiling of 20/s, so the db queue must fill and then reject with `QUEUE_FULL`.
- Teaching point: the system looks healthy at 10/s and falls over at 40/s; latency rises before failures appear.

## Rules for adding a scenario

- Arrival traces are explicit lists or an integer interval, never random.
- Each number is either in the table above or labeled as an assumption in the new scenario.
