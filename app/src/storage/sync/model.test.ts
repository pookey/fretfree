import { afterEach, describe, expect, it } from 'vitest';
import { FretworkDB, SCHEMA_VERSION, STORE_NAMES, TABLE_NAMES } from '../db';
import {
  SYNC_TABLES,
  SYNC_TABLE_NAMES,
  canonical,
  decodeSyncRecord,
  encodeSyncRecord,
  isSyncTable,
  lwwGroups,
  syncId,
  tableSpec,
  toSyncData,
  type SyncRecord,
} from './model';
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

describe('canonical form and wire encoding', () => {
  it('sorts keys, drops undefined and tags dates', () => {
    expect(canonical({ b: 1, a: [undefined, new Date(0)], c: undefined })).toBe(
      '{"a":[null,{"$date":"1970-01-01T00:00:00.000Z"}],"b":1}',
    );
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
