/**
 * Limits the sync API enforces on top of the shared protocol limits
 * (`SYNC_LIMITS` in app/src/storage/sync/model.ts), and the DynamoDB layout
 * (docs/design/sync.md §5, Server notes).
 */
export const SYNC_SERVER = {
  /**
   * Records read or written in one transaction. A transaction holds at most
   * 100 items, and one of them is the user's counter.
   */
  chunkRecords: 99,
  /** Tries at one chunk before the push gives up with 503 (contention is per user). */
  maxAttempts: 8,
  /** Backoff before retry n is up to `backoffMs * 2^n`, capped at `maxBackoffMs`. */
  backoffMs: 25,
  maxBackoffMs: 1000,
  /** One stored record's canonical JSON. A DynamoDB item holds at most 400 KB. */
  maxRecordBytes: 350_000,
  /** A record ID. The sort key `table#id` may be at most 1024 bytes. */
  maxIdBytes: 512,
  /** A pull page stops adding records past this many bytes (a Lambda reply is ≤ 6 MB). */
  maxPullBytes: 1_000_000,
} as const;

/** The table's attribute names (lib/sync-stack.ts `SYNC_TABLE_KEYS`). */
export const ATTR = {
  user: 'userId',
  sort: 'sk',
  /** The record's sequence number, the `bySeq` LSI's sort key. Only records have it. */
  seq: 'seq',
  /** The record's canonical wire JSON. */
  record: 'record',
  /** On the counter item: the last sequence number given out. */
  counter: 'lastSeq',
  /** On the counter item: set while `DELETE /account` runs. Every push and pull then fails. */
  closing: 'closing',
} as const;

/**
 * The per-user counter's sort key. Record keys are `table#id`, and table names
 * start with a letter, so it can't collide with one.
 */
export const COUNTER_SK = '#counter';
