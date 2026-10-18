import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { Rating, State } from 'ts-fsrs';
import { DEFAULT_SETTINGS } from '../engine/model';
import { createScheduler } from '../engine/scheduler';
import { FretworkDB, SCHEMA_VERSION, STORE_NAMES, getDb } from './db';
import { ImportError, exportData, exportToJson, importData, parseExport } from './export-import';
import {
  allCards,
  allConfusions,
  countDue,
  dueCards,
  finishSessionLog,
  getGamification,
  getSettings,
  getSkillStates,
  putSkillState,
  readingFrom,
  recentReviews,
  recordAnswer,
  reviewCount,
  saveSettings,
  startSessionLog,
} from './repository';

const now = new Date('2026-10-18T09:00:00Z');
const DAY = 86_400_000;
const s = createScheduler({ enableFuzz: false });
let db: FretworkDB;
let n = 0;

beforeEach(async () => {
  db = new FretworkDB(`test-${n++}`);
  await db.open();
});

afterEach(async () => {
  await db.delete();
});

function log(itemId: string, at: Date, correct = true) {
  return {
    itemId,
    skillId: 'F2.string6-naturals',
    drillType: 'name-the-note',
    correct,
    responseMs: 1200,
    rating: correct ? Rating.Good : Rating.Again,
    hintUsed: false,
    answerGiven: 'A',
    at,
  };
}

describe('schema', () => {
  it('opens at the current version with every table', () => {
    expect(db.verno).toBe(SCHEMA_VERSION);
    expect(db.tables.map((t) => t.name).sort()).toEqual([...STORE_NAMES].sort());
  });

  it('exposes a shared app database', () => {
    expect(getDb()).toBe(getDb());
  });

  it('opens a database created by an earlier version without losing data', async () => {
    const name = `legacy-${n++}`;
    const legacy = new Dexie(name);
    legacy.version(1).stores({ settings: 'key' });
    await legacy.open();
    await legacy.table('settings').put({ key: 'singleton', handedness: 'left' });
    legacy.close();
    const upgraded = new FretworkDB(name);
    expect((await getSettings(upgraded)).handedness).toBe('left');
    await upgraded.delete();
  });
});

describe('settings and gamification', () => {
  it('returns defaults, then persists patches', async () => {
    expect((await getSettings(db)).handedness).toBe('right');
    await saveSettings(db, { handedness: 'left', sessionMinutes: 5 });
    const saved = await getSettings(db);
    expect(saved.handedness).toBe('left');
    expect(saved.sessionMinutes).toBe(5);
    expect(saved.tuning).toBe('standard');
  });

  it('defaults to reading nothing and learning nothing', async () => {
    expect((await getSettings(db)).reading).toEqual({
      reads: { tab: false, staff: false },
      learn: { tab: false, staff: false },
    });
  });

  it('never hands out the shared default reading object', async () => {
    const reading = (await getSettings(db)).reading;
    reading.reads.tab = true;
    expect(DEFAULT_SETTINGS.reading.reads.tab).toBe(false);
    expect((await getSettings(db)).reading.reads.tab).toBe(false);
  });

  it('round-trips reading through a save', async () => {
    const reading = { reads: { tab: true, staff: false }, learn: { tab: false, staff: true } };
    await saveSettings(db, { reading });
    expect((await getSettings(db)).reading).toEqual(reading);
    await saveSettings(db, { handedness: 'left' });
    expect((await getSettings(db)).reading).toEqual(reading);
  });

  describe('legacy notation (before M1-26)', () => {
    const { reading: _reading, ...legacy } = DEFAULT_SETTINGS;
    const putLegacy = (notation: string) =>
      db.settings.put({ ...legacy, key: 'singleton', notation } as never);
    const none = { tab: false, staff: false };

    it.each([
      ['tab', { tab: true, staff: false }],
      ['staff', { tab: false, staff: true }],
      ['none', none],
    ])('maps notation %s to what the learner reads', async (notation, reads) => {
      await putLegacy(notation);
      const settings = await getSettings(db);
      expect(settings.reading).toEqual({ reads, learn: none });
      expect(settings).not.toHaveProperty('notation');
    });

    it('drops the legacy field on the next save, keeping the mapped value', async () => {
      await putLegacy('tab');
      await saveSettings(db, { sessionMinutes: 5 });
      const row = await db.settings.get('singleton');
      expect(row).not.toHaveProperty('notation');
      expect(row?.reading).toEqual({ reads: { tab: true, staff: false }, learn: none });
    });

    it('prefers a stored reading over a stale notation, filling missing flags', () => {
      expect(
        readingFrom({
          notation: 'staff',
          reading: { reads: { tab: true }, learn: {} } as never,
        }),
      ).toEqual({ reads: { tab: true, staff: false }, learn: none });
    });

    it('ignores an unknown notation value', () => {
      expect(readingFrom({ notation: 42 })).toEqual({ reads: none, learn: none });
    });
  });

  it('returns default gamification state', async () => {
    expect(await getGamification(db)).toMatchObject({
      xpTotal: 0,
      streakCurrent: 0,
      dailyGoalMinutes: 10,
    });
    await db.gamification.put({ ...(await getGamification(db)), xpTotal: 42, key: 'singleton' });
    expect((await getGamification(db)).xpTotal).toBe(42);
  });
});

describe('cards and reviews', () => {
  it('records answers atomically with confusions', async () => {
    const card = s.review(
      s.newCard({ id: 'note@s6f5', skillId: 'F2.string6-naturals' }, now),
      Rating.Again,
      now,
    );
    await recordAnswer(db, {
      card,
      log: log('note@s6f5', now, false),
      confusion: { expected: 'A', given: 'G' },
    });
    await recordAnswer(db, {
      card,
      log: log('note@s6f5', now, false),
      confusion: { expected: 'G', given: 'A' },
    });
    await recordAnswer(db, {
      card,
      log: log('note@s6f5', now),
      confusion: { expected: 'A', given: 'A' },
    });
    expect(await allCards(db)).toHaveLength(1);
    expect(await reviewCount(db)).toBe(3);
    expect(await allConfusions(db)).toEqual([{ a: 'A', b: 'G', count: 2, weight: 2, lastAt: now }]);
  });

  it('finds due cards but never unreviewed new cards', async () => {
    const then = new Date(now.getTime() - 10 * DAY);
    const due = s.review(s.newCard({ id: 'a', skillId: 'x' }, then), Rating.Good, then);
    const fresh = s.newCard({ id: 'b', skillId: 'x' }, then);
    expect(fresh.fsrs.state).toBe(State.New);
    await db.cards.bulkPut([due, fresh]);
    expect((await dueCards(db, now)).map((c) => c.itemId)).toEqual(['a']);
    expect(await countDue(db, now)).toBe(1);
  });

  it('returns the most recent reviews of a skill in time order', async () => {
    for (let i = 0; i < 5; i++)
      await db.reviewLogs.add(log(`i${i}`, new Date(now.getTime() + i * 1000)));
    const recent = await recentReviews(db, 'F2.string6-naturals', 2);
    expect(recent.map((r) => r.itemId)).toEqual(['i3', 'i4']);
  });

  it('stores skill states and session logs', async () => {
    await putSkillState(db, {
      skillId: 'a',
      status: 'practising',
      guideLevel: 2,
      rollingAccuracy: 0.8,
    });
    expect((await getSkillStates(db)).get('a')?.guideLevel).toBe(2);
    const id = await startSessionLog(db, now);
    await finishSessionLog(db, id, { endedAt: now, itemsSeen: 12, accuracy: 0.9 });
    expect((await db.sessionLogs.get(id))?.itemsSeen).toBe(12);
  });
});

describe('export and import', () => {
  it('round-trips all data including dates', async () => {
    const card = s.review(
      s.newCard({ id: 'note@s5f7', skillId: 'F2.string5-naturals' }, now),
      Rating.Good,
      now,
    );
    await recordAnswer(db, { card, log: log('note@s5f7', now) });
    await saveSettings(db, { handedness: 'left' });
    await db.achievements.put({ id: 'string-6-master', unlockedAt: now });

    const json = exportToJson(await exportData(db, now));
    const other = new FretworkDB(`import-${n++}`);
    await other.cards.put({ ...card, itemId: 'stale' });
    await importData(other, parseExport(json));

    const [imported] = await allCards(other);
    expect(imported?.itemId).toBe('note@s5f7');
    expect(imported?.fsrs.due).toBeInstanceOf(Date);
    expect(imported?.fsrs.due.getTime()).toBe(card.fsrs.due.getTime());
    expect((await getSettings(other)).handedness).toBe('left');
    expect((await other.achievements.get('string-6-master'))?.unlockedAt).toEqual(now);
    expect(await reviewCount(other)).toBe(1);
    await other.delete();
  });

  it('rejects invalid, foreign and future files', () => {
    expect(() => parseExport('not json')).toThrow(ImportError);
    expect(() => parseExport('{"app":"other","tables":{}}')).toThrow(/not a FretFree export/);
    expect(() => parseExport('null')).toThrow(/not a FretFree export/);
    expect(() =>
      parseExport(
        JSON.stringify({ app: 'fretwork', schemaVersion: SCHEMA_VERSION + 1, tables: {} }),
      ),
    ).toThrow(/newer version/);
  });

  it('tolerates exports missing tables', async () => {
    await saveSettings(db, { handedness: 'left' });
    await importData(
      db,
      parseExport(JSON.stringify({ app: 'fretwork', schemaVersion: 1, tables: {} })),
    );
    expect((await getSettings(db)).handedness).toBe('right');
  });
});
