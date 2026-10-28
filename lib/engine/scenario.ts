// Fixed slow-payment scenario (docs/04-scenario-pack.md). Every number is a
// template assumption (D-008), not a measurement.

export const NODE_IDS = ["gateway", "order", "cache", "payment", "db"] as const;
export type NodeId = (typeof NODE_IDS)[number];

export interface NodeSpec {
  concurrency: number;
  queueCapacity: number;
  localMs: number;
}

export const NODES: Record<NodeId, NodeSpec> = {
  gateway: { concurrency: 100, queueCapacity: 100, localMs: 2 },
  order: { concurrency: 50, queueCapacity: 40, localMs: 5 }, // D-014/D-015 option A
  cache: { concurrency: 50, queueCapacity: 0, localMs: 1 },
  payment: { concurrency: 10, queueCapacity: 20, localMs: 20 },
  db: { concurrency: 20, queueCapacity: 40, localMs: 10 },
};

// Same-tick completion order: downstream nodes first (docs/05 section 5).
export const COMPLETION_RANK: Record<NodeId, number> = {
  db: 0,
  payment: 1,
  cache: 2,
  order: 3,
  gateway: 4,
};

export const ARRIVAL_INTERVAL_MS = 20; // 50 requests per second (D-015 option A)
export const ARRIVAL_COUNT = 500;
export const HORIZON_MS = 15_000;
export const CACHE_MISS_RATE = 0.25;
export const RETRY_BACKOFF_MS = 50;
export const BREAKER_FAILURE_THRESHOLD = 5;
export const BREAKER_OPEN_MS = 2000;
export const MAX_EVENTS = 200_000;
export const ENGINE_VERSION = "1.0";

export const KNOB_DOMAIN = {
  timeoutMs: { min: 50, max: 5000 },
  retries: { min: 0, max: 5 },
  bulkhead: { min: 1, max: 20 },
} as const;
