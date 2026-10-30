// One model request at a time across the agent and extraction routes, so a
// single visitor cannot run up the credit balance in parallel.
let busy = false;

export function tryAcquire(): boolean {
  if (busy) return false;
  busy = true;
  return true;
}

export function release(): void {
  busy = false;
}
