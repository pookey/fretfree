import {
  canonical,
  isDate,
  lwwGroups,
  tableSpec,
  type FieldRule,
  type FieldTableSpec,
  type RecordTableSpec,
  type SyncData,
  type SyncRecord,
} from './model';

/**
 * Merge rules for every syncable table (docs/design/sync.md). Each merge is a
 * join: commutative, associative and idempotent, so devices and the server
 * converge whatever order versions arrive in, and re-sending is harmless.
 * They are pure and never read the clock: the timestamps come in on the
 * records.
 */

/** Merge two versions of the same record. */
export function mergeRecords(a: SyncRecord, b: SyncRecord): SyncRecord {
  if (a.table !== b.table || a.id !== b.id) {
    throw new RangeError(`Cannot merge ${a.table}/${a.id} with ${b.table}/${b.id}`);
  }
  if (canonical(a) === canonical(b)) return a;
  const spec = tableSpec(a.table);
  return spec.merge === 'record' ? mergeWhole(spec, a, b) : mergeFields(spec, a, b);
}

/**
 * Merge any number of record sets into one, keyed by table and ID. The
 * result is sorted by table, then ID, so equal inputs give equal outputs.
 */
export function mergeRecordSets(...sets: readonly (readonly SyncRecord[])[]): SyncRecord[] {
  const merged = new Map<string, SyncRecord>();
  for (const set of sets) {
    for (const record of set) {
      const key = recordKey(record);
      const seen = merged.get(key);
      merged.set(key, seen ? mergeRecords(seen, record) : record);
    }
  }
  return [...merged.entries()].sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0)).map(([, r]) => r);
}

/** `table` and `id` joined, unique per record. */
export function recordKey(record: Pick<SyncRecord, 'table' | 'id'>): string {
  return `${record.table}\u0000${record.id}`;
}

// --- Whole-record tables ---------------------------------------------------

/**
 * The larger version under a total order, which is a join. Deletable tables
 * order by `updatedAt`, then a tombstone above a live version at the same
 * instant. Append-only tables order any live version above every tombstone
 * first, so a delete never removes a review log.
 */
function mergeWhole(spec: RecordTableSpec, a: SyncRecord, b: SyncRecord): SyncRecord {
  return compareWhole(spec, a, b) >= 0 ? a : b;
}

function compareWhole(spec: RecordTableSpec, a: SyncRecord, b: SyncRecord): number {
  if (!spec.deletable && a.deleted !== b.deleted) return a.deleted ? -1 : 1;
  return (
    a.updatedAt - b.updatedAt ||
    Number(a.deleted) - Number(b.deleted) ||
    compareStrings(canonical(a), canonical(b))
  );
}

// --- Field-merged tables -----------------------------------------------------

/**
 * Field tables are never deleted by sync: a live version beats a tombstone,
 * two tombstones keep the later one, and two live versions merge field by
 * field. Each field rule is itself a join, and so is their product.
 */
function mergeFields(spec: FieldTableSpec, a: SyncRecord, b: SyncRecord): SyncRecord {
  if (a.deleted || b.deleted) {
    if (a.deleted !== b.deleted) return a.deleted ? b : a;
    return (a.updatedAt - b.updatedAt || compareStrings(canonical(a), canonical(b))) >= 0 ? a : b;
  }
  const da = a.data ?? {};
  const db = b.data ?? {};
  const data: SyncData = {};
  const fields: Record<string, number> = {};

  for (const [field, rule] of Object.entries(spec.rules ?? {})) {
    const value = combine(rule, da[field], db[field]);
    if (value !== undefined) data[field] = value;
  }

  const names = [da, db, a.fields ?? {}, b.fields ?? {}].flatMap((o) => Object.keys(o));
  for (const [group, members] of lwwGroups(a.table, names)) {
    const ta = stampOf(a, group, members);
    const tb = stampOf(b, group, members);
    const va = pick(da, members);
    const vb = pick(db, members);
    const winner = (ta - tb || compareStrings(canonical(va), canonical(vb))) >= 0 ? va : vb;
    Object.assign(data, winner);
    const t = Math.max(ta, tb);
    if (Number.isFinite(t)) fields[group] = t;
  }

  return {
    table: a.table,
    id: a.id,
    updatedAt: Math.max(a.updatedAt, b.updatedAt),
    deleted: false,
    data,
    fields,
  };
}

/**
 * When a version last wrote a field group: its own stamp, else the record's
 * `updatedAt` if it holds a value, else never (a version from before the
 * field existed loses to any version that has it).
 */
function stampOf(record: SyncRecord, group: string, members: readonly string[]): number {
  const stamp = record.fields?.[group];
  if (stamp !== undefined) return stamp;
  return members.some((f) => record.data?.[f] !== undefined) ? record.updatedAt : -Infinity;
}

function pick(data: SyncData, fields: readonly string[]): SyncData {
  const out: SyncData = {};
  for (const f of fields) if (data[f] !== undefined) out[f] = data[f];
  return out;
}

/** One field under its rule. A side without the field defers to the other. */
function combine(rule: Exclude<FieldRule, 'lww'>, a: unknown, b: unknown): unknown {
  if (a === undefined) return b === undefined ? undefined : combine(rule, b, b);
  if (b === undefined) return combine(rule, a, a);
  switch (rule) {
    case 'max':
      return Math.max(Number(a), Number(b));
    case 'min': {
      const t = Math.min(asTime(a), asTime(b));
      return new Date(t === Infinity ? NaN : t);
    }
    case 'or':
      return Boolean(a) || Boolean(b);
    case 'union':
      return [...new Set([...asStrings(a), ...asStrings(b)])].sort();
  }
}

/** A date's time; an invalid one sorts last, so `min` keeps any valid date. */
function asTime(value: unknown): number {
  const t = isDate(value) ? value.getTime() : new Date(value as string).getTime();
  return Number.isNaN(t) ? Infinity : t;
}

function asStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function compareStrings(x: string, y: string): number {
  return x < y ? -1 : x > y ? 1 : 0;
}
