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
  // The Garage (design §3.8). Owning a part is permanent: two devices that
  // bought it union to one row, dated by the first purchase. The equipped
  // build is one choice, so the latest wins.
  garagePurchases: {
    keyPath: 'itemId',
    identity: 'key',
    merge: 'fields',
    rules: { at: 'min' },
  },
  garage: { keyPath: 'key', identity: 'key', merge: 'record', deletable: false },
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
 * How an Invalid Date is tagged. `toISOString` throws on one, and a single
 * corrupt date in a legacy row must not abort the v2 upgrade (the database
 * would then never open again). `new Date('invalid')` decodes it back.
 */
const INVALID_DATE = 'invalid';

/**
 * Deterministic JSON: keys sorted, `undefined` dropped, dates as
 * `{"$date": iso}`. Equal values give equal strings on every device and on
 * the server, so it breaks merge ties and detects changes.
 */
export function canonical(value: unknown): string {
  return JSON.stringify(encodeDates(value, true));
}

/**
 * A real date, checked by brand rather than `instanceof`: a substituted
 * `Date` (Playwright's fake clock) also claims objects that merely inherit
 * `Date.prototype`, and their methods throw.
 */
export function isDate(value: unknown): value is Date {
  return Object.prototype.toString.call(value) === '[object Date]';
}

/**
 * `value` with every date tagged `{"$date": iso}`, ready for JSON: the sync
 * wire format and the export file. `sortKeys` gives the canonical form.
 */
export function encodeDates(value: unknown, sortKeys = false): unknown {
  if (isDate(value)) {
    return { [DATE_TAG]: Number.isNaN(value.getTime()) ? INVALID_DATE : value.toISOString() };
  }
  if (Array.isArray(value)) {
    return value.map((v) => (v === undefined ? null : encodeDates(v, sortKeys)));
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = sortKeys ? Object.keys(obj).sort() : Object.keys(obj);
    const out: Record<string, unknown> = {};
    for (const k of keys) if (obj[k] !== undefined) out[k] = encodeDates(obj[k], sortKeys);
    return out;
  }
  return value;
}

/** The inverse of `encodeDates`: tagged dates become `Date`s again. */
export function decodeDates(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(decodeDates);
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj);
    if (keys.length === 1 && keys[0] === DATE_TAG && typeof obj[DATE_TAG] === 'string') {
      return new Date(obj[DATE_TAG]);
    }
    return Object.fromEntries(keys.map((k) => [k, decodeDates(obj[k])]));
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
  return decodeDates(r) as SyncRecord;
}

// --- Legacy rows -----------------------------------------------------------

/**
 * Deterministic uids for append-only rows written before sync existed
 * (schema v1, or a v1 export file). Each is a hash of the row's synced
 * content plus its occurrence among identical rows in local key order. So
 * the same v1 history gets the same uids on every device, whether its
 * database was upgraded in place or it was imported from a v1 export, and
 * sync keeps one copy of each log. Rows created since get random uids.
 */
export function legacyUids(
  table: SyncTableName,
  rows: readonly Record<string, unknown>[],
): string[] {
  const order = rows
    .map((_, i) => i)
    .sort((x, y) => Number(rows[x]?.id) - Number(rows[y]?.id) || x - y);
  const seen = new Map<string, number>();
  const uids: string[] = [];
  for (const i of order) {
    const hash = contentHash(`${table}\u0000${canonical(toSyncData(table, rows[i] ?? {}))}`);
    const n = seen.get(hash) ?? 0;
    seen.set(hash, n + 1);
    uids[i] = `v1-${hash}-${n}`;
  }
  return uids;
}

/** Give each uid-less row of an append-only table its legacy uid. Other rows pass through. */
export function withLegacyUids<T extends Record<string, unknown>>(
  table: string,
  rows: readonly T[],
): (T & { uid?: unknown })[] {
  if (!isSyncTable(table) || tableSpec(table).identity !== 'uid') return [...rows];
  const legacy = rows.filter((r) => typeof r.uid !== 'string');
  const uids = legacyUids(table, legacy);
  const byRow = new Map(legacy.map((r, i) => [r, uids[i]]));
  return rows.map((r) => (byRow.has(r) ? { ...r, uid: byRow.get(r) } : r));
}

/**
 * A 106-bit hash as hex: two cyrb53 lanes with different seeds. Synchronous,
 * so it can run inside a Dexie upgrade transaction (crypto.subtle is async
 * and would let the transaction commit early).
 */
function contentHash(text: string): string {
  return cyrb53(text, 0x9e3779b9) + cyrb53(text, 0x85ebca6b);
}

function cyrb53(text: string, seed: number): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}
