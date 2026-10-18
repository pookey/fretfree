import { describe, expect, it } from 'vitest';
import { mergeRecordSets, mergeRecords, recordKey } from './merge';
import {
  SYNC_TABLE_NAMES,
  canonical,
  decodeSyncRecord,
  encodeSyncRecord,
  type SyncRecord,
  type SyncTableName,
} from './model';
import { pick, randomRecord, seeded, type Rng } from './test-records';

const RUNS = 400;

function same(x: SyncRecord | SyncRecord[], y: SyncRecord | SyncRecord[]) {
  expect(canonical(x)).toBe(canonical(y));
}

function forAll(table: SyncTableName, check: (rng: Rng) => void) {
  for (let seed = 1; seed <= RUNS; seed++) check(seeded(seed * 7919 + table.length));
}

describe.each(SYNC_TABLE_NAMES)('%s merge laws', (table) => {
  it('is commutative', () => {
    forAll(table, (rng) => {
      const a = randomRecord(table, rng);
      const b = randomRecord(table, rng);
      same(mergeRecords(a, b), mergeRecords(b, a));
    });
  });

  it('is associative', () => {
    forAll(table, (rng) => {
      const [a, b, c] = [
        randomRecord(table, rng),
        randomRecord(table, rng),
        randomRecord(table, rng),
      ];
      same(mergeRecords(mergeRecords(a, b), c), mergeRecords(a, mergeRecords(b, c)));
    });
  });

  it('is idempotent, so re-sending a merged record changes nothing', () => {
    forAll(table, (rng) => {
      const a = randomRecord(table, rng);
      const b = randomRecord(table, rng);
      same(mergeRecords(a, a), a);
      const ab = mergeRecords(a, b);
      same(mergeRecords(ab, b), ab);
      same(mergeRecords(ab, a), ab);
    });
  });

  it('gives the same result after a JSON round trip, as on the server', () => {
    forAll(table, (rng) => {
      const a = randomRecord(table, rng);
      const b = randomRecord(table, rng);
      const wire = (r: SyncRecord) =>
        decodeSyncRecord(JSON.parse(JSON.stringify(encodeSyncRecord(r))));
      same(mergeRecords(wire(a), wire(b)), mergeRecords(a, b));
    });
  });
});

describe('mergeRecordSets', () => {
  /** A few devices' worth of versions across every table, several IDs each. */
  function replicas(rng: Rng): SyncRecord[][] {
    return Array.from({ length: 3 }, () =>
      SYNC_TABLE_NAMES.flatMap((table) =>
        ['x', 'y', 'z']
          .filter(() => rng() < 0.6)
          .map((id) => randomRecord(table, rng, `${table}-${id}`)),
      ),
    );
  }

  it('converges whatever order the replicas arrive in', () => {
    for (let seed = 1; seed <= RUNS; seed++) {
      const rng = seeded(seed);
      const sets = replicas(rng);
      const shuffled = [...sets].sort(() => rng() - 0.5).map((s) => [...s].sort(() => rng() - 0.5));
      same(mergeRecordSets(...sets), mergeRecordSets(...shuffled));
      // Merging pairwise first (device to server to device) changes nothing.
      const [x = [], y = [], z = []] = sets;
      same(mergeRecordSets(mergeRecordSets(x, y), z), mergeRecordSets(x, mergeRecordSets(y, z)));
      same(mergeRecordSets(mergeRecordSets(...sets), x), mergeRecordSets(...sets));
    }
  });

  it('never loses a review log, event or session log', () => {
    for (let seed = 1; seed <= RUNS; seed++) {
      const sets = replicas(seeded(seed));
      const merged = new Map(mergeRecordSets(...sets).map((r) => [recordKey(r), r]));
      for (const record of sets.flat()) {
        const kept = merged.get(recordKey(record));
        expect(kept).toBeDefined();
        const appendOnly = ['reviewLogs', 'gamificationEvents', 'sessionLogs'].includes(
          record.table,
        );
        if (appendOnly && !record.deleted) expect(kept?.deleted).toBe(false);
      }
    }
  });

  it('keeps one record per table and ID, sorted', () => {
    const a: SyncRecord = { table: 'cards', id: 'b', updatedAt: 1, deleted: true, data: null };
    const b: SyncRecord = { ...a, id: 'a' };
    const c: SyncRecord = { ...a, table: 'achievements', id: 'z' };
    expect(mergeRecordSets([a, b], [c, a]).map(recordKey)).toEqual([c, b, a].map(recordKey));
  });
});

describe('mergeRecords rules', () => {
  const card = (updatedAt: number, due: string, deleted = false): SyncRecord => ({
    table: 'cards',
    id: 'note@s6f5',
    updatedAt,
    deleted,
    data: deleted ? null : { itemId: 'note@s6f5', fsrs: { due: new Date(due) } },
  });

  it('refuses to merge different records', () => {
    expect(() =>
      mergeRecords(card(1, '2026-10-01'), { ...card(1, '2026-10-01'), id: 'x' }),
    ).toThrow(RangeError);
  });

  it('keeps the later card, and a delete wins a tie', () => {
    same(mergeRecords(card(1, '2026-10-01'), card(2, '2026-10-05')), card(2, '2026-10-05'));
    same(mergeRecords(card(2, '2026-10-01'), card(1, '2026-10-05')), card(2, '2026-10-01'));
    same(mergeRecords(card(2, '2026-10-01'), card(2, '', true)), card(2, '', true));
    same(mergeRecords(card(3, '2026-10-01'), card(2, '', true)), card(3, '2026-10-01'));
  });

  it('keeps a review log over a later tombstone', () => {
    const log: SyncRecord = {
      table: 'reviewLogs',
      id: 'u1',
      updatedAt: 1,
      deleted: false,
      data: { itemId: 'note@s6f5', correct: true },
    };
    const tomb: SyncRecord = { ...log, updatedAt: 9, deleted: true, data: null };
    same(mergeRecords(log, tomb), log);
    same(mergeRecords(tomb, { ...tomb, updatedAt: 3 }), tomb);
  });

  it('merges settings field by field, each by its own timestamp', () => {
    const base = { table: 'settings', id: 'singleton', deleted: false } as const;
    const ipad: SyncRecord = {
      ...base,
      updatedAt: 20,
      data: { key: 'singleton', handedness: 'left', volume: 0.8 },
      fields: { key: 1, handedness: 20, volume: 1 },
    };
    const phone: SyncRecord = {
      ...base,
      updatedAt: 15,
      data: { key: 'singleton', handedness: 'right', volume: 0.3, blindMode: true },
      fields: { key: 1, handedness: 2, volume: 15, blindMode: 15 },
    };
    const merged = mergeRecords(ipad, phone);
    expect(merged.data).toEqual({
      key: 'singleton',
      handedness: 'left',
      volume: 0.3,
      blindMode: true,
    });
    expect(merged.fields).toEqual({ key: 1, handedness: 20, volume: 15, blindMode: 15 });
    expect(merged.updatedAt).toBe(20);
  });

  it('moves the streak fields together and keeps the highest XP total', () => {
    const base = { table: 'gamification', id: 'singleton', deleted: false } as const;
    const a: SyncRecord = {
      ...base,
      updatedAt: 10,
      data: {
        xpTotal: 150,
        streakLongest: 4,
        streakCurrent: 4,
        freezesHeld: 1,
        dailyGoalMinutes: 5,
      },
      fields: { streak: 10, dailyGoalMinutes: 10 },
    };
    const b: SyncRecord = {
      ...base,
      updatedAt: 12,
      data: {
        xpTotal: 130,
        streakLongest: 9,
        streakCurrent: 0,
        freezesHeld: 0,
        dailyGoalMinutes: 10,
      },
      fields: { streak: 12, dailyGoalMinutes: 3 },
    };
    expect(mergeRecords(a, b).data).toEqual({
      xpTotal: 150,
      streakLongest: 9,
      streakCurrent: 0,
      freezesHeld: 0,
      dailyGoalMinutes: 5,
    });
  });

  it('joins a day: highest totals, either flag, every quest', () => {
    const day = (data: object): SyncRecord => ({
      table: 'dailyProgress',
      id: '2026-10-18',
      updatedAt: 1,
      deleted: false,
      data: { date: '2026-10-18', ...data },
    });
    const merged = mergeRecords(
      day({ xp: 40, minutes: 12, goalMet: true, freezeUsed: false, questsCompleted: ['try-mic'] }),
      day({ xp: 70, minutes: 6, goalMet: false, questsCompleted: ['clear-due', 'try-mic'] }),
    );
    expect(merged.data).toEqual({
      date: '2026-10-18',
      xp: 70,
      minutes: 12,
      goalMet: true,
      freezeUsed: false,
      questsCompleted: ['clear-due', 'try-mic'],
    });
  });

  it('keeps the first unlock of an achievement, and a tombstone never removes one', () => {
    const unlock = (iso: string): SyncRecord => ({
      table: 'achievements',
      id: 'whole-neck',
      updatedAt: 5,
      deleted: false,
      data: { id: 'whole-neck', unlockedAt: new Date(iso) },
    });
    const first = mergeRecords(unlock('2026-10-03'), unlock('2026-10-01'));
    expect(first.data?.unlockedAt).toEqual(new Date('2026-10-01'));
    const tomb: SyncRecord = { ...unlock('2026-10-01'), updatedAt: 99, deleted: true, data: null };
    same(mergeRecords(tomb, first), first);
  });

  it('adds a confusion count from either side and keeps the later decay', () => {
    const conf = (count: number, at: number, weight: number): SyncRecord => ({
      table: 'confusions',
      id: '["E","F"]',
      updatedAt: at,
      deleted: false,
      data: { a: 'E', b: 'F', count, weight },
      fields: { decay: at },
    });
    expect(mergeRecords(conf(5, 1, 0.2), conf(2, 2, 1.1)).data).toMatchObject({
      count: 5,
      weight: 1.1,
    });
  });

  it('falls back to updatedAt when a field has no timestamp', () => {
    const rng = seeded(3);
    const a: SyncRecord = {
      table: 'settings',
      id: 'singleton',
      updatedAt: pick(rng, [5]),
      deleted: false,
      data: { volume: 0.2 },
    };
    const b: SyncRecord = { ...a, updatedAt: 4, data: { volume: 0.9 }, fields: { volume: 4 } };
    expect(mergeRecords(a, b).data).toEqual({ volume: 0.2 });
  });
});
