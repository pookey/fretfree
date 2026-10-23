import { afterEach, describe, expect, it } from 'vitest';
import { FretworkDB, SCHEMA_VERSION, STORE_NAMES, TABLE_NAMES } from '../db';
import {
  SYNC_TABLES,
  SYNC_TABLE_NAMES,
  canonical,
  decodeDates,
  decodeSyncRecord,
  encodeDates,
  encodeSyncRecord,
  isDate,
  legacyUids,
  withLegacyUids,
  isSyncTable,
  lwwGroups,
  syncId,
  tableSpec,
  toSyncData,
  type SyncRecord,
} from './model';
import { mergeRecords } from './merge';
import { SYNC_BOOKKEEPING_TABLES } from './tracking';

describe('the syncable tables', () => {
  let db: FretworkDB | null = null;
  afterEach(async () => {
    await db?.delete();
  });

  it('are every data table, with the primary keys the schema declares', async () => {
    db = new FretworkDB('sync-model-schema');
    await db.open();
    expect(db.verno).toBe(SCHEMA_VERSION);
    expect([...SYNC_TABLE_NAMES].sort()).toEqual([...TABLE_NAMES].sort());
    expect([...STORE_NAMES].sort()).toEqual([...TABLE_NAMES, ...SYNC_BOOKKEEPING_TABLES].sort());
    for (const name of SYNC_TABLE_NAMES) {
      const schema = db.table(name).schema;
      expect(schema.primKey.keyPath, name).toEqual(tableSpec(name).keyPath);
      const uidIndex = schema.indexes.find((i) => i.name === 'uid');
      expect(Boolean(uidIndex?.unique), name).toBe(tableSpec(name).identity === 'uid');
    }
  });

  it('declare rules and groups only on field-merged tables', () => {
    expect(isSyncTable('cards')).toBe(true);
    expect(isSyncTable('syncMeta')).toBe(false);
    expect(isSyncTable('toString')).toBe(false);
    for (const spec of Object.values(SYNC_TABLES)) {
      if (spec.merge === 'record') expect(spec).not.toHaveProperty('rules');
    }
  });
});

describe('the garage tables', () => {
  const first = new Date('2026-10-23T09:00:00Z');
  const second = new Date('2026-10-24T09:00:00Z');

  it('union a part bought on two devices to one row, dated by the first purchase', () => {
    expect(syncId('garagePurchases', { itemId: 'finish.blue' })).toBe('finish.blue');
    const bought = (at: Date, updatedAt: number): SyncRecord => ({
      table: 'garagePurchases',
      id: 'finish.blue',
      updatedAt,
      deleted: false,
      data: { itemId: 'finish.blue', price: 120, at },
      fields: { itemId: updatedAt, price: updatedAt },
    });
    for (const [a, b] of [
      [bought(second, 2), bought(first, 1)],
      [bought(first, 1), bought(second, 2)],
    ] as const) {
      expect(mergeRecords(a, b).data).toEqual({ itemId: 'finish.blue', price: 120, at: first });
    }
  });

  it('keep the latest equipped build whole', () => {
    const build = (name: string, updatedAt: number): SyncRecord => ({
      table: 'garage',
      id: 'singleton',
      updatedAt,
      deleted: false,
      data: { key: 'singleton', spec: { finish: name }, name },
    });
    expect(mergeRecords(build('Mine', 1), build('Theirs', 2)).data?.name).toBe('Theirs');
    expect(mergeRecords(build('Theirs', 2), build('Mine', 1)).data?.name).toBe('Theirs');
    const gone: SyncRecord = { ...build('x', 3), deleted: true, data: null };
    expect(mergeRecords(build('Mine', 1), gone).deleted).toBe(false);
  });
});

describe('identity', () => {
  it('uses the natural key, a JSON array for a compound one, or the uid', () => {
    expect(syncId('cards', { itemId: 'note@s6f5' })).toBe('note@s6f5');
    expect(syncId('confusions', { a: 'E', b: 'F|G' })).toBe('["E","F|G"]');
    expect(syncId('reviewLogs', { id: 4, uid: 'u-1' })).toBe('u-1');
    expect(() => syncId('reviewLogs', { id: 4 })).toThrow(TypeError);
  });

  it('drops device-local keys from synced data', () => {
    expect(toSyncData('reviewLogs', { id: 4, uid: 'u-1', itemId: 'x' })).toEqual({ itemId: 'x' });
    expect(toSyncData('cards', { itemId: 'x', skillId: 's' })).toEqual({
      itemId: 'x',
      skillId: 's',
    });
  });

  it('gives each lww field its own timestamp unless it is grouped or has a rule', () => {
    expect([
      ...lwwGroups('gamification', ['xpTotal', 'streak', 'weekendAmulet', 'freezesHeld']),
    ]).toEqual([
      ['streak', SYNC_TABLES.gamification.groups.streak],
      ['weekendAmulet', ['weekendAmulet']],
    ]);
    expect([...lwwGroups('cards', ['itemId'])]).toEqual([]);
  });
});

describe('legacy uids', () => {
  const at = new Date('2026-10-18T09:00:00Z');
  const row = (id: number, itemId = 'x') => ({ id, itemId, at });

  it('derive from content and occurrence, not from the local key or input order', () => {
    const uids = legacyUids('reviewLogs', [row(1), row(2, 'y'), row(3)]);
    expect(uids[0]).toMatch(/-0$/);
    expect(uids[2]).toBe(uids[0]!.replace(/-0$/, '-1'));
    expect(new Set(uids).size).toBe(3);
    // Another device numbered the same history differently and listed it out of order.
    expect(legacyUids('reviewLogs', [row(30), row(20, 'y'), row(10)])).toEqual([
      uids[2],
      uids[1],
      uids[0],
    ]);
    expect(legacyUids('gamificationEvents', [row(1)])[0]).not.toBe(uids[0]);
  });

  it('are added only to append-only rows that lack one', () => {
    const rows = [{ ...row(1), uid: 'kept' }, row(2)];
    const out = withLegacyUids('reviewLogs', rows);
    expect(out[0]).toBe(rows[0]);
    expect(out[1]?.uid).toBe(legacyUids('reviewLogs', [row(2)])[0]);
    expect(withLegacyUids('cards', [row(1)])).toEqual([row(1)]);
    expect(withLegacyUids('notATable', [row(1)])).toEqual([row(1)]);
  });
});

describe('canonical form and wire encoding', () => {
  it('sorts keys, drops undefined and tags dates', () => {
    expect(canonical({ b: 1, a: [undefined, new Date(0)], c: undefined })).toBe(
      '{"a":[null,{"$date":"1970-01-01T00:00:00.000Z"}],"b":1}',
    );
  });

  it('tags an Invalid Date instead of throwing, and decodes it back', () => {
    const bad = new Date('not a date');
    expect(canonical({ at: bad })).toBe('{"at":{"$date":"invalid"}}');
    const back = decodeDates(JSON.parse(JSON.stringify(encodeDates({ at: bad })))) as { at: Date };
    expect(isDate(back.at) && Number.isNaN(back.at.getTime())).toBe(true);
    expect(legacyUids('reviewLogs', [{ id: 1, at: bad }])[0]).toMatch(/^v1-/);
  });

  it('tags only real dates, not objects that inherit Date.prototype', () => {
    expect(isDate(new Date(0))).toBe(true);
    const imposter = Object.assign(Object.create(Date.prototype) as object, { n: 1 });
    expect(isDate(imposter)).toBe(false);
    expect(canonical({ at: imposter })).toBe('{"at":{"n":1}}');
  });

  it('tags dates in place for the export file, keeping key order', () => {
    const value = { b: new Date(0), a: [undefined, 1], c: undefined };
    expect(JSON.stringify(encodeDates(value))).toBe(
      '{"b":{"$date":"1970-01-01T00:00:00.000Z"},"a":[null,1]}',
    );
    expect(decodeDates(encodeDates(value))).toEqual({ b: new Date(0), a: [null, 1] });
  });

  it('round-trips a record through JSON', () => {
    const record: SyncRecord = {
      table: 'achievements',
      id: 'whole-neck',
      updatedAt: 5,
      deleted: false,
      data: { id: 'whole-neck', unlockedAt: new Date('2026-10-18T09:00:00Z'), tags: [new Date(0)] },
      fields: { id: 5 },
    };
    const wire = JSON.parse(JSON.stringify(encodeSyncRecord(record)));
    expect(decodeSyncRecord(wire)).toEqual(record);
  });

  it('rejects anything that is not a record', () => {
    const ok = { table: 'cards', id: 'x', updatedAt: 1, deleted: true, data: null };
    expect(decodeSyncRecord(ok)).toEqual(ok);
    for (const bad of [
      null,
      { ...ok, table: 'syncMeta' },
      { ...ok, id: 3 },
      { ...ok, updatedAt: '1' },
      { ...ok, deleted: 'no' },
      { ...ok, data: 'x' },
    ]) {
      expect(() => decodeSyncRecord(bad)).toThrow(TypeError);
    }
  });
});
