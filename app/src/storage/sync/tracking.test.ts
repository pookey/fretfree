import { afterEach, describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { Rating } from 'ts-fsrs';
import { FretworkDB } from '../db';
import { exportData, importData } from '../export-import';
import { commitGamification, logEvent } from '../gamification-repo';
import { finishSessionLog, saveSettings, startSessionLog } from '../repository';
import { mergeRecordSets } from './merge';
import { canonical, type SyncRecord } from './model';
import {
  acknowledgePushed,
  mergeIntoLocal,
  pendingRecords,
  readSyncRecord,
  type SyncClock,
  type SyncMetaRow,
} from './tracking';

let n = 0;
const open: FretworkDB[] = [];

/** A database whose clock the test moves by hand. */
function device(prefix = 'dev', start = 1000) {
  const clock = { t: start, ids: 0 };
  const fake: SyncClock = { now: () => clock.t, newId: () => `${prefix}-${clock.ids++}` };
  const db = new FretworkDB(`sync-tracking-${n++}`, fake);
  open.push(db);
  return { db, clock };
}

afterEach(async () => {
  for (const db of open.splice(0)) await db.delete();
});

const card = (itemId: string, stability: number) => ({
  itemId,
  skillId: 'F2.string6-naturals',
  fsrs: { due: new Date('2026-10-20T09:00:00Z'), stability, state: 2 },
  createdAt: new Date('2026-10-01T09:00:00Z'),
  lastReviewedAt: null,
});

const log = (itemId: string, at = new Date('2026-10-18T09:00:00Z')) => ({
  itemId,
  skillId: 'F2.string6-naturals',
  drillType: 'name-the-note',
  correct: true,
  responseMs: 1200,
  rating: Rating.Good,
  hintUsed: false,
  answerGiven: 'A',
  at,
});

async function meta(db: FretworkDB, table: string, id: string) {
  return (await db.syncMeta.get([table, id])) as SyncMetaRow | undefined;
}

describe('change tracking', () => {
  it('stamps and queues every write to a syncable table', async () => {
    const { db } = device();
    await db.cards.put(card('note@s6f5', 1) as never);
    const logId = await db.reviewLogs.add(log('note@s6f5') as never);
    const row = await db.reviewLogs.get(logId);
    expect(row).toMatchObject({ uid: 'dev-0' });
    expect(await meta(db, 'cards', 'note@s6f5')).toEqual({
      table: 'cards',
      id: 'note@s6f5',
      updatedAt: 1000,
      deleted: 0,
    });
    expect((await db.outbox.toArray()).map((o) => `${o.table}/${o.id}`).sort()).toEqual([
      'cards/note@s6f5',
      'reviewLogs/dev-0',
    ]);
  });

  it('leaves the bookkeeping tables and read-only work alone', async () => {
    const { db } = device();
    await db.syncState.put({ key: 'singleton', account: null, cursor: null, lastSyncedAt: null });
    await db.cards.toArray();
    expect(await db.outbox.count()).toBe(0);
  });

  it('skips a rewrite that changes nothing', async () => {
    const { db, clock } = device();
    await db.cards.put(card('note@s6f5', 1) as never);
    clock.t = 5000;
    await db.cards.put(card('note@s6f5', 1) as never);
    expect((await meta(db, 'cards', 'note@s6f5'))?.updatedAt).toBe(1000);
    await db.cards.put(card('note@s6f5', 2) as never);
    expect((await meta(db, 'cards', 'note@s6f5'))?.updatedAt).toBe(5000);
  });

  it('keeps updatedAt increasing when the clock goes backwards', async () => {
    const { db, clock } = device();
    await db.cards.put(card('note@s6f5', 1) as never);
    clock.t = 10;
    await db.cards.put(card('note@s6f5', 2) as never);
    expect((await meta(db, 'cards', 'note@s6f5'))?.updatedAt).toBe(1001);
  });

  it('stamps only the settings fields that changed', async () => {
    const { db, clock } = device();
    await saveSettings(db, { volume: 0.5 });
    const first = (await meta(db, 'settings', 'singleton'))?.fields;
    expect(first?.handedness).toBe(1000);
    clock.t = 2000;
    await saveSettings(db, { handedness: 'left' });
    const fields = (await meta(db, 'settings', 'singleton'))?.fields;
    expect(fields).toMatchObject({ handedness: 2000, volume: 1000, key: 1000 });
  });

  it('moves the streak fields of gamification on one timestamp', async () => {
    const { db, clock } = device();
    await commitGamification(db, {
      state: {
        dailyGoalMinutes: 10,
        xpTotal: 10,
        streakCurrent: 1,
        streakLongest: 1,
        lastGoalMetDate: '2026-10-18',
        freezesHeld: 0,
        weekendAmulet: false,
        streakRepairDeadline: null,
        streakBeforeBreak: 0,
      },
      events: [],
      at: new Date(),
    });
    clock.t = 3000;
    await db.gamification.update('singleton', { streakCurrent: 2 });
    expect((await meta(db, 'gamification', 'singleton'))?.fields).toEqual({
      dailyGoalMinutes: 1000,
      key: 1000,
      streak: 3000,
      weekendAmulet: 1000,
    });
  });

  it('keeps a session log uid through an update and a full put', async () => {
    const { db, clock } = device();
    const id = await startSessionLog(db, new Date('2026-10-18T09:00:00Z'));
    clock.t = 2000;
    await finishSessionLog(db, id, { endedAt: new Date(), itemsSeen: 3, accuracy: 1 });
    const { uid: _uid, ...row } = (await db.sessionLogs.get(id))!;
    await db.sessionLogs.put(row as never);
    expect((await db.sessionLogs.get(id))?.uid).toBe('dev-0');
    expect((await meta(db, 'sessionLogs', 'dev-0'))?.updatedAt).toBe(2000);
  });

  it('writes a tombstone on delete and on clear', async () => {
    const { db, clock } = device();
    await db.cards.bulkPut([card('a', 1), card('b', 1)] as never);
    await db.confusions.put({ a: 'E', b: 'F', count: 1 });
    clock.t = 2000;
    await db.cards.delete('a');
    expect(await readSyncRecord(db, 'cards', 'a')).toEqual({
      table: 'cards',
      id: 'a',
      updatedAt: 2000,
      deleted: true,
      data: null,
    });
    await db.cards.delete('missing');
    clock.t = 3000;
    await db.confusions.clear();
    expect(await meta(db, 'confusions', '["E","F"]')).toMatchObject({
      deleted: 1,
      updatedAt: 3000,
    });
    await db.cards.where('itemId').equals('b').delete();
    expect(await meta(db, 'cards', 'b')).toMatchObject({ deleted: 1 });
  });

  it('keeps review log identity through export and import', async () => {
    const { db } = device('a');
    await db.reviewLogs.add(log('note@s6f5') as never);
    await logEvent(db, { type: 'achievement-unlocked', achievementId: 'x' }, new Date());
    const file = exportData(db);
    expect(Object.keys((await file).tables)).not.toContain('syncMeta');

    const { db: other, clock } = device('b', 5000);
    await other.reviewLogs.add(log('note@s5f3') as never);
    await importData(other, await file);
    expect((await other.reviewLogs.toArray()).map((r) => r.uid)).toEqual(['a-0']);
    // The replaced log is a tombstone; the imported one is live again, stamped now.
    expect(await meta(other, 'reviewLogs', 'b-0')).toMatchObject({ deleted: 1 });
    expect(await meta(other, 'reviewLogs', 'a-0')).toMatchObject({
      deleted: 0,
      updatedAt: clock.t,
    });
    expect(await meta(other, 'gamificationEvents', 'a-1')).toMatchObject({ deleted: 0 });
  });
});

describe('schema v2 upgrade', () => {
  it('gives old rows a uid, stamps them and queues them all for the first push', async () => {
    const name = `sync-legacy-${n++}`;
    const legacy = new Dexie(name);
    legacy.version(1).stores({
      settings: 'key',
      cards: 'itemId, skillId, fsrs.due',
      reviewLogs: '++id, itemId, skillId, drillType, at',
      confusions: '[a+b], a, b',
      gamification: 'key',
    });
    await legacy.open();
    await legacy.table('settings').put({ key: 'singleton', handedness: 'left' });
    await legacy.table('cards').put(card('note@s6f5', 1));
    await legacy.table('reviewLogs').bulkAdd([log('note@s6f5'), log('note@s6f5')]);
    await legacy.table('confusions').put({ a: 'E', b: 'F', count: 2 });
    legacy.close();

    const clock: SyncClock = {
      now: () => 777,
      newId: (() => {
        let i = 0;
        return () => `u${i++}`;
      })(),
    };
    const db = new FretworkDB(name, clock);
    open.push(db);
    expect((await db.reviewLogs.toArray()).map((r) => r.uid)).toEqual(['u0', 'u1']);
    expect(
      (await db.outbox.toArray()).map((o) => `${o.table}/${o.id}@${o.updatedAt}`).sort(),
    ).toEqual([
      'cards/note@s6f5@777',
      'confusions/["E","F"]@777',
      'reviewLogs/u0@777',
      'reviewLogs/u1@777',
      'settings/singleton@777',
    ]);
    expect((await meta(db, 'confusions', '["E","F"]'))?.fields).toEqual({
      a: 777,
      b: 777,
      decay: 777,
    });
    expect((await pendingRecords(db, 10)).length).toBe(5);
  });
});

describe('pushing and pulling', () => {
  it('reads queued records and drops them once pushed, unless changed since', async () => {
    const { db, clock } = device();
    await db.cards.bulkPut([card('a', 1), card('b', 1)] as never);
    const pending = await pendingRecords(db, 10);
    expect(pending.map((r) => r.id)).toEqual(['a', 'b']);
    clock.t = 2000;
    await db.cards.put(card('b', 4) as never);
    await acknowledgePushed(db, pending);
    expect((await db.outbox.toArray()).map((o) => o.id)).toEqual(['b']);
  });

  it('skips queued records that have vanished', async () => {
    const { db } = device();
    await db.outbox.put({ table: 'cards', id: 'ghost', updatedAt: 1 });
    await db.syncMeta.put({ table: 'cards', id: 'ghost', updatedAt: 1, deleted: 0 });
    expect(await pendingRecords(db, 10)).toEqual([]);
    expect(await readSyncRecord(db, 'cards', 'nothing')).toBeNull();
  });

  it('applies pulled records untracked, and queues what the server lacks', async () => {
    const { db } = device();
    await db.cards.put(card('mine', 9) as never);
    await db.cards.put(card('gone', 1) as never);
    await db.outbox.clear();
    const remote: SyncRecord[] = [
      { table: 'reviewLogs', id: 'far-1', updatedAt: 50, deleted: false, data: log('x') },
      { table: 'cards', id: 'mine', updatedAt: 10, deleted: false, data: card('mine', 1) },
      { table: 'cards', id: 'gone', updatedAt: 5000, deleted: true, data: null },
      {
        table: 'confusions',
        id: '["E","F"]',
        updatedAt: 50,
        deleted: false,
        data: { a: 'E', b: 'F', count: 3 },
        fields: { a: 50, b: 50, decay: 50 },
      },
    ];
    const queued = await mergeIntoLocal(db, remote);
    expect(queued.map((r) => r.id)).toEqual(['mine']);
    expect((await db.outbox.toArray()).map((o) => o.id)).toEqual(['mine']);
    expect((await db.reviewLogs.toArray())[0]).toMatchObject({ uid: 'far-1', itemId: 'x' });
    expect(await meta(db, 'reviewLogs', 'far-1')).toMatchObject({ updatedAt: 50 });
    expect(await db.cards.get('gone')).toBeUndefined();
    expect(await db.confusions.get(['E', 'F'])).toMatchObject({ count: 3 });
    // Pulling the same page again changes nothing.
    expect(await mergeIntoLocal(db, remote)).toHaveLength(1);
    expect(await db.reviewLogs.count()).toBe(1);
    await mergeIntoLocal(db, [{ ...remote[0]!, updatedAt: 60 }]);
    expect(await db.reviewLogs.count()).toBe(1);
  });
});

describe('two devices', () => {
  /** A fake sync API: merged records with a sequence number per change. */
  function server() {
    const store = new Map<string, { record: SyncRecord; seq: number }>();
    let seq = 0;
    return {
      push(records: SyncRecord[]) {
        for (const r of records) {
          const key = `${r.table}/${r.id}`;
          const seen = store.get(key);
          const merged = seen ? mergeRecordSets([seen.record], [r])[0]! : r;
          if (!seen || canonical(merged) !== canonical(seen.record))
            store.set(key, { record: merged, seq: ++seq });
        }
      },
      pull(cursor: number) {
        const page = [...store.values()]
          .filter((e) => e.seq > cursor)
          .sort((x, y) => x.seq - y.seq);
        return { records: page.map((e) => e.record), cursor: page.at(-1)?.seq ?? cursor };
      },
    };
  }

  async function sync(db: FretworkDB, api: ReturnType<typeof server>, cursor: { at: number }) {
    for (let round = 0; round < 5; round++) {
      const pending = await pendingRecords(db, 500);
      api.push(pending);
      await acknowledgePushed(db, pending);
      const page = api.pull(cursor.at);
      cursor.at = page.cursor;
      await mergeIntoLocal(db, page.records);
      if ((await db.outbox.count()) === 0) return;
    }
    throw new Error('sync did not settle');
  }

  async function snapshot(db: FretworkDB) {
    const metas = (await db.syncMeta.toArray()) as SyncMetaRow[];
    const records = await Promise.all(metas.map((m) => readSyncRecord(db, m.table, m.id)));
    return canonical(mergeRecordSets(records.filter((r): r is SyncRecord => r !== null)));
  }

  it('converge after diverging offline, with every review log on both', async () => {
    const api = server();
    const a = device('a', 1000);
    const b = device('b', 1000);
    const ca = { at: 0 };
    const cb = { at: 0 };

    await a.db.cards.put(card('note@s6f5', 1) as never);
    await a.db.reviewLogs.add(log('note@s6f5') as never);
    await saveSettings(a.db, { volume: 0.4 });
    await sync(a.db, api, ca);
    await sync(b.db, api, cb);
    expect(await b.db.reviewLogs.count()).toBe(1);

    // Both practise offline.
    a.clock.t = 2000;
    await a.db.cards.put(card('note@s6f5', 3) as never);
    await a.db.reviewLogs.add(log('note@s6f5') as never);
    await saveSettings(a.db, { handedness: 'left' });
    b.clock.t = 2500;
    await b.db.cards.put(card('note@s6f5', 2) as never);
    await b.db.reviewLogs.bulkAdd([log('note@s6f5'), log('note@s5f3')] as never);
    await saveSettings(b.db, { volume: 0.9 });
    await b.db.achievements.put({ id: 'string-6-master', unlockedAt: new Date('2026-10-18') });

    await sync(a.db, api, ca);
    await sync(b.db, api, cb);
    await sync(a.db, api, ca);

    expect(await a.db.reviewLogs.count()).toBe(4);
    expect(await b.db.reviewLogs.count()).toBe(4);
    expect(await snapshot(a.db)).toBe(await snapshot(b.db));
    const settings = await a.db.settings.get('singleton');
    expect(settings).toMatchObject({ handedness: 'left', volume: 0.9 });
    expect((await b.db.cards.get('note@s6f5'))?.fsrs.stability).toBe(2);
    expect(await a.db.achievements.count()).toBe(1);
  });
});
