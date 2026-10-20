import { SYNC_SERVER } from './config';

/** How the handlers wait between retries. `random` is in [0, 1) and jitters the wait. */
export interface Backoff {
  sleep(ms: number): Promise<void>;
  random(): number;
}

/** Waits before retry `attempt` (1, 2, …): exponential with jitter, capped. */
export async function waitToRetry(backoff: Backoff, attempt: number): Promise<void> {
  const cap = Math.min(SYNC_SERVER.backoffMs * 2 ** attempt, SYNC_SERVER.maxBackoffMs);
  await backoff.sleep(Math.round(cap * (0.5 + backoff.random() / 2)));
}
