/**
 * The sync contract (design §11 M7, docs/design/sync.md): which tables sync,
 * how each record is identified, and how two versions of it merge. Pure TS
 * with no Dexie import, so the sync Lambda (M7-03) can share it.
 *
 * Local rows keep the shape the app already reads. Sync metadata (`updatedAt`,
 * per-field timestamps, tombstones) lives beside them in `syncMeta`, written
 * by `tracking.ts`. Only the append-only tables, whose local keys are
 * auto-increment numbers, carry a `uid` on the row itself, so the ID survives
 * a JSON export and import.
 */

/** How one field of a field-merged record combines two versions. */
export type FieldRule =
  /** Last writer wins, by the field's own timestamp in `SyncRecord.fields`. */
  | 'lww'
  /** The larger number: a counter or a high-water mark. */
  | 'max'
  /** The earlier date: when something first happened. */
  | 'min'
  /** Either side's `true`: a flag that is never unset. */
  | 'or'
  /** The set union of two string arrays, sorted. */
  | 'union';

interface TableIdentity {
  /** The Dexie primary key path. A compound key's ID is its JSON array. */
  keyPath: string | readonly string[];
  /**
   * `key`: the primary key is natural and the same on every device, so it is
   * the sync ID (`cards` by item ID, `dailyProgress` by date).
   * `uid`: the primary key is a local auto-increment number, so the row
   * carries a random `uid` that is the sync ID instead.
   */
  identity: 'key' | 'uid';
}

/**
 * Whole-record merges: the version with the later `updatedAt` wins.
 * `deletable: false` tables are append-only in spirit: a live version always
 * beats a tombstone, so a review log is never lost to a delete anywhere.
 */
export interface RecordTableSpec extends TableIdentity {
  merge: 'record';
  deletable: boolean;
}

/**
 * Per-field merges. Fields without a rule are `lww`, each on its own
 * timestamp, unless `groups` binds several fields to one timestamp so they
 * always change together (the streak state machine). These tables are never
 * deletable: a live version always beats a tombstone.
 */
export interface FieldTableSpec extends TableIdentity {
  merge: 'fields';
  rules?: Readonly<Record<string, Exclude<FieldRule, 'lww'>>>;
  groups?: Readonly<Record<string, readonly string[]>>;
}

export type TableSpec = RecordTableSpec | FieldTableSpec;

/**
 * Every syncable table. Each local table of `db.ts` is here except the sync
 * bookkeeping itself (`syncMeta`, `outbox`, `syncState`); `model.test.ts` checks
 * that the two lists and their primary keys agree.
 *
 * Streaks and day stats are derived data. Their merges are join-semilattices
 * so they always converge, but a day practised on two devices offline merges
 * to the larger of the two totals, not the sum. The client sync engine
 * re-derives them from the merged logs after a pull (docs/design/sync.md).
 */
export const SYNC_TABLES = {
  settings: { keyPath: 'key', identity: 'key', merge: 'fields' },
  cards: { keyPath: 'itemId', identity: 'key', merge: 'record', deletable: true },
  reviewLogs: { keyPath: 'id', identity: 'uid', merge: 'record', deletable: false },
  skillStates: { keyPath: 'skillId', identity: 'key', merge: 'record', deletable: true },
  confusions: {
    keyPath: ['a', 'b'],
    identity: 'key',
    merge: 'fields',
    rules: { count: 'max' },
    groups: { decay: ['weight', 'lastAt'] },
  },
  sessionLogs: { keyPath: 'id', identity: 'uid', merge: 'record', deletable: false },
  gamification: {
    keyPath: 'key',
    identity: 'key',
    merge: 'fields',
    rules: { xpTotal: 'max', streakLongest: 'max' },
    groups: {
      streak: [
        'streakCurrent',
        'lastGoalMetDate',
        'freezesHeld',
        'streakRepairDeadline',
        'streakBeforeBreak',
      ],
    },
  },
  dailyProgress: {
    keyPath: 'date',
    identity: 'key',
    merge: 'fields',
    rules: { xp: 'max', minutes: 'max', goalMet: 'or', freezeUsed: 'or', questsCompleted: 'union' },
  },
  achievements: { keyPath: 'id', identity: 'key', merge: 'fields', rules: { unlockedAt: 'min' } },
  gamificationEvents: { keyPath: 'id', identity: 'uid', merge: 'record', deletable: false },
} as const satisfies Record<string, TableSpec>;

export type SyncTableName = keyof typeof SYNC_TABLES;

export const SYNC_TABLE_NAMES = Object.keys(SYNC_TABLES) as SyncTableName[];

export function isSyncTable(name: string): name is SyncTableName {
  return Object.hasOwn(SYNC_TABLES, name);
}

export function tableSpec(table: SyncTableName): TableSpec {
  return SYNC_TABLES[table];
}

/** Protocol limits shared by the client and the sync API (M7-03). */
export const SYNC_LIMITS = {
  /** Most records in one push or one pull page. */
  maxBatchRecords: 500,
  /** Most bytes of encoded JSON in one push body. */
  maxBatchBytes: 1_000_000,
} as const;

/** A row's data as it syncs: without its local key, if that is device-local. */
export type SyncData = Record<string, unknown>;

/**
 * One version of one record, as pushed, pulled and merged. `updatedAt` and
 * `fields` are milliseconds on the writer's clock.
 */
export interface SyncRecord {
  table: SyncTableName;
  /** Stable across devices: the natural key, or the row's `uid`. */
  id: string;
  updatedAt: number;
  /** A tombstone: the record was deleted at `updatedAt` and `data` is null. */
  deleted: boolean;
  data: SyncData | null;
  /** Field-merged tables only: the timestamp of each `lww` field or group. */
  fields?: Record<string, number>;
}

// --- Identity ------------------------------------------------------------

/** The sync ID of a local row. */
export function syncId(table: SyncTableName, row: Readonly<Record<string, unknown>>): string {
  const spec = tableSpec(table);
  if (spec.identity === 'uid') {
    if (typeof row.uid !== 'string') throw new TypeError(`A ${table} row has no uid`);
    return row.uid;
  }
  if (typeof spec.keyPath === 'string') return String(row[spec.keyPath]);
  return JSON.stringify(spec.keyPath.map((p) => row[p]));
}

/** A local row as sync data: the device-local key and `uid` dropped. */
export function toSyncData(table: SyncTableName, row: Readonly<Record<string, unknown>>): SyncData {
  if (tableSpec(table).identity === 'key') return { ...row };
  const { id: _local, uid: _uid, ...data } = row;
  return data;
}

/**
 * Each `lww` timestamp a field-merged table keeps, mapped to the fields it
 * covers: the declared groups, then every other field without a rule on its own.
 */
export function lwwGroups(
  table: SyncTableName,
  fieldNames: Iterable<string>,
): Map<string, string[]> {
  const spec = tableSpec(table);
  const out = new Map<string, string[]>();
  if (spec.merge !== 'fields') return out;
  const grouped = new Set<string>();
  for (const [group, members] of Object.entries(spec.groups ?? {})) {
    out.set(group, [...members]);
    for (const m of members) grouped.add(m);
  }
  for (const f of [...new Set(fieldNames)].sort()) {
    if (!grouped.has(f) && !out.has(f) && !(spec.rules && Object.hasOwn(spec.rules, f))) {
      out.set(f, [f]);
    }
  }
  return out;
}

// --- Canonical form and wire encoding --------------------------------------

const DATE_TAG = '$date';

/**
 * Deterministic JSON: keys sorted, `undefined` dropped, dates as
 * `{"$date": iso}`. Equal values give equal strings on every device and on
 * the server, so it breaks merge ties and detects changes.
 */
export function canonical(value: unknown): string {
  return JSON.stringify(toCanonical(value));
}

function toCanonical(value: unknown): unknown {
  if (value instanceof Date) return { [DATE_TAG]: value.toISOString() };
  if (Array.isArray(value)) return value.map((v) => (v === undefined ? null : toCanonical(v)));
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(obj).sort()) {
      if (obj[k] !== undefined) out[k] = toCanonical(obj[k]);
    }
    return out;
  }
  return value;
}

/** A record as JSON-safe wire data: dates tagged as in the export file. */
export function encodeSyncRecord(record: SyncRecord): unknown {
  return JSON.parse(canonical(record));
}

/** The inverse of `encodeSyncRecord`. Throws on anything that is not a record. */
export function decodeSyncRecord(wire: unknown): SyncRecord {
  const r = wire as Partial<SyncRecord> | null;
  if (
    !r ||
    typeof r.table !== 'string' ||
    !isSyncTable(r.table) ||
    typeof r.id !== 'string' ||
    typeof r.updatedAt !== 'number' ||
    typeof r.deleted !== 'boolean' ||
    (r.data !== null && typeof r.data !== 'object')
  ) {
    throw new TypeError('Not a sync record');
  }
  return fromCanonical(r) as SyncRecord;
}

function fromCanonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(fromCanonical);
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj);
    if (keys.length === 1 && keys[0] === DATE_TAG && typeof obj[DATE_TAG] === 'string') {
      return new Date(obj[DATE_TAG]);
    }
    return Object.fromEntries(keys.map((k) => [k, fromCanonical(obj[k])]));
  }
  return value;
}
