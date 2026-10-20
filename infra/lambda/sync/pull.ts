import { SYNC_LIMITS } from '../../../app/src/storage/sync/model';
import { SYNC_SERVER } from './config';
import { queryBySeq, readCounter, type StoredRecord, type SyncTable } from './table';

export interface PullPage {
  /** Wire records, oldest change first. */
  records: unknown[];
  /** Opaque to the client: the sequence number of the last record served. */
  cursor: string;
  more: boolean;
}

/**
 * Reads `?cursor=&limit=`. An empty or missing cursor means "everything", and
 * the limit defaults to and is capped at `SYNC_LIMITS.maxBatchRecords`.
 */
export function parsePullQuery(
  query: Record<string, string | undefined> | undefined,
): { cursor: number; limit: number } | { error: 'invalid-cursor' | 'invalid-limit' } {
  const cursorText = query?.cursor ?? '';
  const cursor = cursorText === '' ? 0 : Number(cursorText);
  if (!/^\d*$/.test(cursorText) || !Number.isSafeInteger(cursor)) {
    return { error: 'invalid-cursor' };
  }
  const limitText = query?.limit;
  const limit = limitText === undefined ? SYNC_LIMITS.maxBatchRecords : Number(limitText);
  if (!Number.isSafeInteger(limit) || limit < 1) return { error: 'invalid-limit' };
  return { cursor, limit: Math.min(limit, SYNC_LIMITS.maxBatchRecords) };
}

/**
 * The user's records changed after `cursor` (docs/design/sync.md §5, Pull).
 * Served from the seq LSI with consistent reads, and only up to the counter
 * read when the pull began: every seq up to it has committed, so the page has
 * a fixed end even while pushes land, and the cursor never skips a record.
 * A page also stops at `maxPullBytes`, but always holds at least one record.
 */
export async function pullRecords(
  t: SyncTable,
  userId: string,
  cursor: number,
  limit: number,
): Promise<PullPage | 'account-closing'> {
  const counter = await readCounter(t, userId);
  if (counter.closing) return 'account-closing';
  // A cursor past the counter can't come from this account's history, so serve
  // everything again. Merging records already held is a no-op.
  const after = cursor > counter.lastSeq ? 0 : cursor;

  // Reads one record past the page, to tell whether there is more, and stops
  // reading as soon as the page is full by count or by bytes.
  const served: StoredRecord[] = [];
  let bytes = 0;
  let more = false;
  let startKey: Parameters<typeof queryBySeq>[5];
  paging: while (after < counter.lastSeq) {
    const page = await queryBySeq(
      t,
      userId,
      after,
      counter.lastSeq,
      limit + 1 - served.length,
      startKey,
    );
    for (const record of page.records) {
      const size = Buffer.byteLength(record.json);
      if (
        served.length === limit ||
        (served.length > 0 && bytes + size > SYNC_SERVER.maxPullBytes)
      ) {
        more = true;
        break paging;
      }
      served.push(record);
      bytes += size;
    }
    startKey = page.next;
    if (!startKey) break;
  }
  return {
    records: served.map((r) => JSON.parse(r.json) as unknown),
    cursor: String(served.at(-1)?.seq ?? after),
    more,
  };
}
