import { mergeRecords, mergeRecordSets } from '../../../app/src/storage/sync/merge';
import {
  canonical,
  decodeSyncRecord,
  SYNC_LIMITS,
  type SyncRecord,
} from '../../../app/src/storage/sync/model';
import { SYNC_SERVER } from './config';
import { waitToRetry, type Backoff } from './retry';
import {
  isContention,
  readSnapshot,
  writeRecords,
  type RecordWrite,
  type StoredRecord,
  type SyncTable,
} from './table';

export type PushResult =
  | { ok: true; written: number }
  | { ok: false; error: 'account-closing' | 'busy' | 'record-too-large' };

/** The sort key of a record: `table#id`. */
export const recordSk = (r: Pick<SyncRecord, 'table' | 'id'>): string => `${r.table}#${r.id}`;

/**
 * Checks a push body: `{ records }` with at most `SYNC_LIMITS.maxBatchRecords`
 * well-formed records. Returns the decoded records, or why the body is refused.
 */
export function decodePushBody(
  body: unknown,
):
  | { records: SyncRecord[] }
  | { error: 'invalid-body' | 'batch-too-large' | 'invalid-record' | 'record-too-large' } {
  const records = (body as { records?: unknown } | undefined)?.records;
  if (!Array.isArray(records)) return { error: 'invalid-body' };
  if (records.length > SYNC_LIMITS.maxBatchRecords) return { error: 'batch-too-large' };
  const decoded: SyncRecord[] = [];
  for (const wire of records) {
    let record: SyncRecord;
    try {
      record = decodeSyncRecord(wire);
    } catch {
      return { error: 'invalid-record' };
    }
    if (!isWellFormed(record)) return { error: 'invalid-record' };
    if (!fitsInItem(canonical(record))) return { error: 'record-too-large' };
    decoded.push(record);
  }
  return { records: decoded };
}

/** What `decodeSyncRecord` leaves unchecked, and what the table's keys need. */
function isWellFormed(r: SyncRecord): boolean {
  const stamps = r.fields === undefined ? [] : Object.values(r.fields);
  return (
    r.id.length > 0 &&
    Buffer.byteLength(r.id) <= SYNC_SERVER.maxIdBytes &&
    Number.isFinite(r.updatedAt) &&
    !Array.isArray(r.data) &&
    (r.fields === undefined || (typeof r.fields === 'object' && !Array.isArray(r.fields))) &&
    stamps.every((t) => typeof t === 'number' && Number.isFinite(t))
  );
}

/**
 * Merges a batch into the user's records (docs/design/sync.md §5, Push). The
 * batch is first merged into one version per record, then written in chunks
 * of up to 99, each one transaction with the counter. A chunk reads the
 * counter and its records together, merges, and writes only the records that
 * changed, conditioned on nothing having moved since the read. On contention
 * it re-reads, re-merges and retries. Every merge is a join, so re-pushing a
 * batch whose earlier chunks already committed changes nothing.
 */
export async function pushRecords(
  t: SyncTable,
  userId: string,
  batch: readonly SyncRecord[],
  backoff: Backoff,
): Promise<PushResult> {
  const records = mergeRecordSets(batch);
  let written = 0;
  for (let i = 0; i < records.length; i += SYNC_SERVER.chunkRecords) {
    const result = await pushChunk(
      t,
      userId,
      records.slice(i, i + SYNC_SERVER.chunkRecords),
      backoff,
    );
    if (!result.ok) return result;
    written += result.written;
  }
  return { ok: true, written };
}

async function pushChunk(
  t: SyncTable,
  userId: string,
  chunk: readonly SyncRecord[],
  backoff: Backoff,
): Promise<PushResult> {
  const sks = chunk.map(recordSk);
  for (let attempt = 0; attempt < SYNC_SERVER.maxAttempts; attempt++) {
    if (attempt > 0) await waitToRetry(backoff, attempt);
    try {
      const snapshot = await readSnapshot(t, userId, sks);
      if (snapshot.closing) return { ok: false, error: 'account-closing' };
      const writes = changedRecords(chunk, sks, snapshot.records);
      if (writes === undefined) return { ok: false, error: 'record-too-large' };
      if (writes.length > 0) await writeRecords(t, userId, snapshot, writes);
      return { ok: true, written: writes.length };
    } catch (error) {
      // A read that met a write in flight, or a write that lost a race: re-read.
      if (isContention(error)) continue;
      throw error;
    }
  }
  return { ok: false, error: 'busy' };
}

/**
 * Each record merged with its stored version, keeping only those that change
 * it. Undefined if a merged record outgrew `maxRecordBytes`.
 */
function changedRecords(
  chunk: readonly SyncRecord[],
  sks: readonly string[],
  stored: ReadonlyMap<string, StoredRecord>,
): RecordWrite[] | undefined {
  const writes: RecordWrite[] = [];
  for (const [i, incoming] of chunk.entries()) {
    const sk = sks[i]!;
    const current = stored.get(sk);
    const merged = current
      ? mergeRecords(decodeSyncRecord(JSON.parse(current.json)), incoming)
      : incoming;
    const json = canonical(merged);
    if (json === current?.json) continue;
    if (!fitsInItem(json)) return undefined;
    writes.push({ sk, json, replaces: current?.seq });
  }
  return writes;
}

const fitsInItem = (json: string) => Buffer.byteLength(json) <= SYNC_SERVER.maxRecordBytes;
