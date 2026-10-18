import type Dexie from 'dexie';
import type {
  DBCore,
  DBCoreMutateRequest,
  DBCoreMutateResponse,
  DBCoreTable,
  DBCoreTransaction,
  IndexableType,
  Middleware,
  Transaction,
} from 'dexie';
import { mergeRecords } from './merge';
import {
  SYNC_TABLES,
  SYNC_TABLE_NAMES,
  canonical,
  isSyncTable,
  lwwGroups,
  syncId,
  tableSpec,
  toSyncData,
  type SyncData,
  type SyncRecord,
  type SyncTableName,
} from './model';

/**
 * Local change tracking for sync (docs/design/sync.md). A Dexie middleware
 * watches every write to a syncable table and, in the same transaction,
 * stamps the record's `syncMeta` row (`updatedAt`, per-field timestamps or a
 * tombstone) and queues it in the `outbox`. The repositories don't change:
 * rows keep the shape the app reads, and append-only rows gain a `uid`.
 *
 * Writes that come from the server go through `mergeIntoLocal`, which turns
 * tracking off for its transaction so a pull never re-stamps what it applies.
 */

export const SYNC_META = 'syncMeta';
export const OUTBOX = 'outbox';
export const SYNC_STATE = 'syncState';

/** Sync bookkeeping. These tables never sync, export or import. */
export const SYNC_BOOKKEEPING_TABLES = [SYNC_META, OUTBOX, SYNC_STATE] as const;

/** Sync metadata for one record, keyed `[table+id]`. */
export interface SyncMetaRow {
  table: SyncTableName;
  id: string;
  updatedAt: number;
  /** 1 for a tombstone: the row is gone locally. A number so it can be indexed. */
  deleted: 0 | 1;
  fields?: Record<string, number>;
}

/** A record changed locally and not yet pushed, keyed `[table+id]`. */
export interface OutboxRow {
  table: SyncTableName;
  id: string;
  /** The record's `updatedAt` when it was queued. */
  updatedAt: number;
}

/** The pull cursor and account (M7-05), one row keyed 'singleton'. */
export interface SyncStateRow {
  key: 'singleton';
  /** The signed-in account the cursor belongs to; a different one resets it. */
  account: string | null;
  /** The server's opaque cursor from the last pull, or null to pull everything. */
  cursor: string | null;
  lastSyncedAt: Date | null;
}

/** Where tracking reads the time and new IDs. Tests pass a fake. */
export interface SyncClock {
  now(): number;
  newId(): string;
}

export const systemClock: SyncClock = {
  now: () => Date.now(),
  newId: () => crypto.randomUUID(),
};

const untracked = new WeakSet<DBCoreTransaction>();

type Row = Record<string, unknown>;

/** The middleware `FretworkDB` installs. */
export function syncTracking(clock: SyncClock): Middleware<DBCore> {
  return {
    stack: 'dbcore',
    name: 'syncTracking',
    create(down) {
      return {
        ...down,
        transaction(stores, mode, options) {
          // Widen write transactions so the metadata commits atomically with the row.
          const widen = mode === 'readwrite' && stores.some(isSyncTable);
          const all = widen ? [...new Set([...stores, SYNC_META, OUTBOX])] : stores;
          return down.transaction(all, mode, options);
        },
        table(name) {
          const table = down.table(name);
          if (!isSyncTable(name)) return table;
          return {
            ...table,
            mutate: (req) =>
              untracked.has(req.trans)
                ? table.mutate(req)
                : trackedMutate(down, table, name, req, clock),
          };
        },
      };
    },
  };
}

async function trackedMutate(
  down: DBCore,
  table: DBCoreTable,
  name: SyncTableName,
  req: DBCoreMutateRequest,
  clock: SyncClock,
): Promise<DBCoreMutateResponse> {
  const { trans } = req;
  const pk = table.schema.primaryKey;
  if (req.type === 'add' || req.type === 'put') {
    const keys = req.values.map(
      (v, i) => req.keys?.[i] ?? (pk.extractKey ? pk.extractKey(v) : undefined),
    );
    const known = keys.filter((k) => k !== undefined);
    const found = known.length ? await table.getMany({ trans, keys: known }) : [];
    const before = new Map<string, Row>();
    known.forEach((k, i) => {
      if (found[i]) before.set(canonical(k), found[i] as Row);
    });
    const old = keys.map((k) => (k === undefined ? undefined : before.get(canonical(k))));
    let values = req.values as readonly Row[];
    if (tableSpec(name).identity === 'uid') {
      values = values.map((v, i) =>
        typeof v.uid === 'string' ? v : { ...v, uid: old[i]?.uid ?? clock.newId() },
      );
    }
    const res = await table.mutate({ ...req, values });
    const changes = values.flatMap((row, i) => (res.failures[i] ? [] : [{ row, old: old[i] }]));
    await stamp(down, trans, name, changes, clock);
    return res;
  }
  const doomed =
    req.type === 'delete'
      ? await table.getMany({ trans, keys: req.keys })
      : (await table.query({ trans, values: true, query: { index: pk, range: req.range } })).result;
  const res = await table.mutate(req);
  await stamp(
    down,
    trans,
    name,
    (doomed as (Row | undefined)[]).flatMap((old) => (old ? [{ row: null, old }] : [])),
    clock,
  );
  return res;
}

interface Change {
  /** The row as written, or null for a delete. */
  row: Row | null;
  old: Row | undefined;
}

/** Write `syncMeta` and `outbox` rows for changed records; unchanged rewrites are skipped. */
async function stamp(
  down: DBCore,
  trans: DBCoreTransaction,
  name: SyncTableName,
  changes: readonly Change[],
  clock: SyncClock,
): Promise<void> {
  const byId = new Map<string, Change>();
  for (const c of changes) byId.set(syncId(name, (c.row ?? c.old)!), c);
  if (byId.size === 0) return;
  const ids = [...byId.keys()];
  const metas = (await down
    .table(SYNC_META)
    .getMany({ trans, keys: ids.map((id) => [name, id]) })) as (SyncMetaRow | undefined)[];
  const now = clock.now();
  const nextMeta: SyncMetaRow[] = [];
  ids.forEach((id, i) => {
    const { row, old } = byId.get(id)!;
    const meta = metas[i];
    const live = meta && !meta.deleted;
    if (row && old && live && sameData(name, row, old)) return;
    if (!row && !live && meta) return;
    const updatedAt = Math.max(now, (meta?.updatedAt ?? -Infinity) + 1);
    const next: SyncMetaRow = { table: name, id, updatedAt, deleted: row ? 0 : 1 };
    if (row && SYNC_TABLES[name].merge === 'fields') {
      next.fields = fieldStamps(name, row, live ? old : undefined, meta?.fields, updatedAt);
    }
    nextMeta.push(next);
  });
  if (nextMeta.length === 0) return;
  await put(down, trans, SYNC_META, nextMeta);
  await put(
    down,
    trans,
    OUTBOX,
    nextMeta.map(({ table, id, updatedAt }): OutboxRow => ({ table, id, updatedAt })),
  );
}

function sameData(name: SyncTableName, a: Row, b: Row): boolean {
  return canonical(toSyncData(name, a)) === canonical(toSyncData(name, b));
}

/** Each `lww` group keeps its timestamp unless one of its fields changed. */
function fieldStamps(
  name: SyncTableName,
  row: Row,
  old: Row | undefined,
  previous: Record<string, number> | undefined,
  updatedAt: number,
): Record<string, number> {
  const fields: Record<string, number> = {};
  for (const [group, members] of lwwGroups(
    name,
    [row, old ?? {}, previous ?? {}].flatMap((o) => Object.keys(o)),
  )) {
    const kept = previous?.[group];
    const changed = !old || members.some((f) => canonical(row[f]) !== canonical(old[f]));
    fields[group] = changed || kept === undefined ? updatedAt : kept;
  }
  return fields;
}

async function put(down: DBCore, trans: DBCoreTransaction, store: string, values: unknown[]) {
  const res = await down.table(store).mutate({ type: 'put', trans, values });
  if (res.numFailures) throw Object.values(res.failures)[0];
}

// --- Upgrade --------------------------------------------------------------

/**
 * Schema v2 upgrade: give append-only rows a `uid`, then stamp every existing
 * row and queue it, so the first push after sign-in uploads all local
 * progress (M7-05).
 */
export async function backfillSyncMeta(tx: Transaction, clock: SyncClock): Promise<void> {
  const now = clock.now();
  for (const name of SYNC_TABLE_NAMES) {
    const table = tx.table(name);
    if (tableSpec(name).identity === 'uid') {
      await table.toCollection().modify((row: Row) => {
        if (typeof row.uid !== 'string') row.uid = clock.newId();
      });
    }
    const rows = (await table.toArray()) as Row[];
    const metas = rows.map((row): SyncMetaRow => {
      const meta: SyncMetaRow = { table: name, id: syncId(name, row), updatedAt: now, deleted: 0 };
      if (SYNC_TABLES[name].merge === 'fields') {
        meta.fields = Object.fromEntries(
          [...lwwGroups(name, Object.keys(row)).keys()].map((g) => [g, now]),
        );
      }
      return meta;
    });
    await tx.table(SYNC_META).bulkPut(metas);
    await tx
      .table(OUTBOX)
      .bulkPut(metas.map(({ table, id, updatedAt }) => ({ table, id, updatedAt })));
  }
}

// --- Reading and applying records -------------------------------------------

const ALL_TABLES = [...SYNC_TABLE_NAMES, ...SYNC_BOOKKEEPING_TABLES];

/** Run `fn` in one read-write transaction whose writes are not tracked. */
async function withoutTracking<T>(db: Dexie, fn: () => Promise<T>): Promise<T> {
  return db.transaction('rw', ALL_TABLES, async (tx) => {
    untracked.add(tx.idbtrans as unknown as DBCoreTransaction);
    return fn();
  });
}

async function localRow(db: Dexie, table: SyncTableName, id: string): Promise<Row | undefined> {
  const spec = tableSpec(table);
  if (spec.identity === 'uid') return db.table(table).where('uid').equals(id).first();
  return db.table(table).get(typeof spec.keyPath === 'string' ? id : JSON.parse(id));
}

/** The local version of one record, or null if this device has never had it. */
export async function readSyncRecord(
  db: Dexie,
  table: SyncTableName,
  id: string,
): Promise<SyncRecord | null> {
  const meta = (await db.table(SYNC_META).get([table, id])) as SyncMetaRow | undefined;
  if (!meta) return null;
  const base = { table, id, updatedAt: meta.updatedAt };
  if (meta.deleted) return { ...base, deleted: true, data: null };
  const row = await localRow(db, table, id);
  if (!row) return null;
  return {
    ...base,
    deleted: false,
    data: toSyncData(table, row),
    ...(meta.fields && { fields: meta.fields }),
  };
}

/** Up to `limit` queued records, as they stand now, to push. */
export async function pendingRecords(db: Dexie, limit: number): Promise<SyncRecord[]> {
  const queued = (await db.table(OUTBOX).limit(limit).toArray()) as OutboxRow[];
  const records = await Promise.all(queued.map((q) => readSyncRecord(db, q.table, q.id)));
  return records.filter((r): r is SyncRecord => r !== null);
}

/**
 * Drop pushed records from the outbox. An entry queued again after `records`
 * were read has a later `updatedAt` and stays for the next push.
 */
export async function acknowledgePushed(db: Dexie, records: readonly SyncRecord[]): Promise<void> {
  await db.transaction('rw', db.table(OUTBOX), async () => {
    for (const r of records) {
      const queued = (await db.table(OUTBOX).get([r.table, r.id])) as OutboxRow | undefined;
      if (queued && queued.updatedAt <= r.updatedAt) await db.table(OUTBOX).delete([r.table, r.id]);
    }
  });
}

/**
 * Merge pulled records into the local database in one transaction. Each is
 * merged with the local version and the result stored, untracked. A result
 * that differs from what the server sent (the server lacks a local change) is
 * queued to push; otherwise its outbox entry is dropped. Returns the queued ones.
 */
export async function mergeIntoLocal(
  db: Dexie,
  remote: readonly SyncRecord[],
): Promise<SyncRecord[]> {
  return withoutTracking(db, async () => {
    const queued: SyncRecord[] = [];
    for (const incoming of remote) {
      const local = await readSyncRecord(db, incoming.table, incoming.id);
      const merged = local ? mergeRecords(local, incoming) : incoming;
      if (!local || canonical(merged) !== canonical(local)) await writeLocal(db, merged);
      const key = [merged.table, merged.id];
      if (canonical(merged) === canonical(incoming)) {
        await db.table(OUTBOX).delete(key);
      } else {
        await db
          .table(OUTBOX)
          .put({ table: merged.table, id: merged.id, updatedAt: merged.updatedAt });
        queued.push(merged);
      }
    }
    return queued;
  });
}

async function writeLocal(db: Dexie, record: SyncRecord): Promise<void> {
  const { table, id } = record;
  const existing = await localRow(db, table, id);
  const meta: SyncMetaRow = {
    table,
    id,
    updatedAt: record.updatedAt,
    deleted: record.deleted ? 1 : 0,
  };
  if (record.fields) meta.fields = record.fields;
  if (record.deleted) {
    if (existing) await db.table(table).delete(primaryKey(table, existing));
  } else {
    await db.table(table).put(toLocalRow(table, id, record.data ?? {}, existing));
  }
  await db.table(SYNC_META).put(meta);
}

function primaryKey(table: SyncTableName, row: Row): IndexableType {
  const { keyPath } = tableSpec(table);
  return (typeof keyPath === 'string' ? row[keyPath] : keyPath.map((p) => row[p])) as IndexableType;
}

function toLocalRow(
  table: SyncTableName,
  id: string,
  data: SyncData,
  existing: Row | undefined,
): Row {
  if (tableSpec(table).identity === 'key') return { ...data };
  // A record new to this device gets a fresh local key from auto-increment.
  return existing ? { ...data, uid: id, id: existing.id } : { ...data, uid: id };
}
