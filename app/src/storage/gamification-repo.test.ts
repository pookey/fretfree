import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Rating } from 'ts-fsrs';
import {
  ACHIEVEMENTS,
  applyDay,
  checkAchievements,
  definitionsFrom,
  xpForAnswer,
} from '../engine/gamification';
import type { AchievementDefinition } from '../engine/gamification/types';
import type { GamificationEvent } from '../engine/gamification/types';
import { FretworkDB } from './db';
import { exportData, importData } from './export-import';
import {
  commitGamification,
  dailyProgressBetween,
  emptyDailyProgress,
  getDailyProgress,
  getEvents,
  getUnlockedAchievements,
  logEvent,
  saveDailyProgress,
  saveGamification,
  unlockAchievements,
} from './gamification-repo';
import { DEFAULT_GAMIFICATION } from './gamification-model';
import { getGamification } from './repository';

const now = new Date('2026-10-18T09:00:00Z');
const HOUR = 3_600_000;
let db: FretworkDB;
let n = 0;

beforeEach(async () => {
  db = new FretworkDB(`gamification-test-${n++}`);
  await db.open();
});

afterEach(async () => {
  await db.delete();
});

const answer: GamificationEvent = {
  type: 'answer',
  itemId: 'note@s6f5',
  skillId: 'F2.string6-naturals',
  correct: true,
  rating: Rating.Easy,
  kind: 'due',
  xp: 12,
};

describe('gamification state', () => {
  it('defaults until saved, then merges patches', async () => {
    expect(await getGamification(db)).toEqual(DEFAULT_GAMIFICATION);
    await saveGamification(db, { xpTotal: 40, streakCurrent: 3 });
    const next = await saveGamification(db, { dailyGoalMinutes: 15 });
    expect(next).toMatchObject({ xpTotal: 40, streakCurrent: 3, dailyGoalMinutes: 15 });
    expect(await getGamification(db)).toEqual(next);
  });
});

describe('daily progress', () => {
  it('returns an empty day when nothing was practised', async () => {
    expect(await getDailyProgress(db, '2026-10-18')).toEqual(emptyDailyProgress('2026-10-18'));
  });

  it('round-trips a day', async () => {
    const day = { ...emptyDailyProgress('2026-10-18'), xp: 90, minutes: 11, goalMet: true };
    await saveDailyProgress(db, { ...day, questsCompleted: ['clear-due'] });
    expect(await getDailyProgress(db, '2026-10-18')).toEqual({
      ...day,
      questsCompleted: ['clear-due'],
    });
  });

  it('lists a date range inclusively and in order, across a month boundary', async () => {
    for (const date of ['2026-11-02', '2026-10-30', '2026-10-31', '2026-11-01', '2026-10-29']) {
      await saveDailyProgress(db, emptyDailyProgress(date));
    }
    const days = await dailyProgressBetween(db, '2026-10-30', '2026-11-01');
    expect(days.map((d) => d.date)).toEqual(['2026-10-30', '2026-10-31', '2026-11-01']);
  });
});

describe('event log', () => {
  it('logs events and reads them back with their payload', async () => {
    const id = await logEvent(db, answer, now);
    expect(id).toBeGreaterThan(0);
    const deadline = new Date(now.getTime() + 48 * HOUR);
    await logEvent(
      db,
      { type: 'streak-broken', date: '2026-10-17', previousStreak: 9, repairDeadline: deadline },
      new Date(now.getTime() + HOUR),
    );
    expect(await getEvents(db)).toEqual([
      { ...answer, id, at: now },
      {
        type: 'streak-broken',
        date: '2026-10-17',
        previousStreak: 9,
        repairDeadline: deadline,
        id: expect.any(Number),
        at: new Date(now.getTime() + HOUR),
      },
    ]);
  });

  it('filters by type and since, oldest first', async () => {
    const goal: GamificationEvent = { type: 'goal-met', date: '2026-10-18', minutes: 10, xp: 80 };
    await logEvent(db, answer, new Date(now.getTime() + 2 * HOUR));
    await logEvent(db, answer, now);
    await logEvent(db, goal, new Date(now.getTime() + HOUR));
    const answers = await getEvents(db, { type: 'answer' });
    expect(answers.map((e) => e.at)).toEqual([now, new Date(now.getTime() + 2 * HOUR)]);
    const later = await getEvents(db, { since: new Date(now.getTime() + HOUR) });
    expect(later.map((e) => e.type)).toEqual(['goal-met', 'answer']);
    const laterAnswers = await getEvents(db, {
      type: 'answer',
      since: new Date(now.getTime() + HOUR),
    });
    expect(laterAnswers.map((e) => e.at)).toEqual([new Date(now.getTime() + 2 * HOUR)]);
    expect(await getEvents(db, { type: 'freeze-used' })).toEqual([]);
  });
});

describe('achievements', () => {
  it('unlocks once, logs each unlock and ignores repeats', async () => {
    expect(await unlockAchievements(db, ['string-6-master', 'streak-7', 'streak-7'], now)).toEqual([
      'string-6-master',
      'streak-7',
    ]);
    const later = new Date(now.getTime() + HOUR);
    expect(await unlockAchievements(db, ['streak-7', 'speed-demon'], later)).toEqual([
      'speed-demon',
    ]);
    const unlocked = await getUnlockedAchievements(db);
    expect([...unlocked.entries()].sort()).toEqual([
      ['speed-demon', later],
      ['streak-7', now],
      ['string-6-master', now],
    ]);
    const events = await getEvents(db, { type: 'achievement-unlocked' });
    expect(events.map((e) => (e.type === 'achievement-unlocked' ? e.achievementId : ''))).toEqual([
      'string-6-master',
      'streak-7',
      'speed-demon',
    ]);
  });
});

describe('commitGamification', () => {
  it('writes state, days and every event in one go', async () => {
    const state = { ...DEFAULT_GAMIFICATION, streakCurrent: 7, streakLongest: 7, freezesHeld: 1 };
    const today = { ...emptyDailyProgress('2026-10-18'), minutes: 10, goalMet: true };
    const events: GamificationEvent[] = [
      { type: 'goal-met', date: '2026-10-18', minutes: 10, xp: 75 },
      { type: 'streak-extended', date: '2026-10-18', streak: 7, milestone: 7, freezeEarned: true },
    ];
    await commitGamification(db, { state, days: [today], events, at: now });
    expect(await getGamification(db)).toEqual(state);
    expect(await getDailyProgress(db, '2026-10-18')).toEqual(today);
    expect((await getEvents(db)).map((e) => e.type)).toEqual(['goal-met', 'streak-extended']);
  });

  it('can log events alone', async () => {
    await commitGamification(db, { events: [answer], at: now });
    expect(await getGamification(db)).toEqual(DEFAULT_GAMIFICATION);
    expect(await getEvents(db)).toHaveLength(1);
  });

  it('rolls back everything if a write fails', async () => {
    const bad = { ...emptyDailyProgress('2026-10-18'), date: undefined as unknown as string };
    await expect(
      commitGamification(db, {
        state: { ...DEFAULT_GAMIFICATION, xpTotal: 99 },
        days: [bad],
        events: [answer],
        at: now,
      }),
    ).rejects.toThrow();
    expect(await getGamification(db)).toEqual(DEFAULT_GAMIFICATION);
    expect(await getEvents(db)).toEqual([]);
  });
});

describe('export / import', () => {
  it('carries gamification tables, including dates inside event payloads', async () => {
    const deadline = new Date(now.getTime() + 48 * HOUR);
    await saveGamification(db, { xpTotal: 10, streakRepairDeadline: deadline });
    const day = {
      ...emptyDailyProgress('2026-10-18'),
      xp: 60,
      minutes: 12,
      goalMet: true,
      questsCompleted: ['clear-due'],
    };
    await saveDailyProgress(db, day);
    await unlockAchievements(db, ['streak-7'], now);
    await logEvent(
      db,
      { type: 'streak-broken', date: '2026-10-17', previousStreak: 3, repairDeadline: deadline },
      now,
    );
    const file = await exportData(db, now);
    const other = new FretworkDB(`gamification-test-${n++}`);
    await other.open();
    try {
      await importData(other, file);
      expect(await getGamification(other)).toEqual(await getGamification(db));
      expect(await getDailyProgress(other, '2026-10-18')).toEqual(day);
      expect(await getUnlockedAchievements(other)).toEqual(await getUnlockedAchievements(db));
      expect(await getEvents(other)).toEqual(await getEvents(db));
    } finally {
      await other.delete();
    }
  });
});

describe('engine contracts (stubs filled by M1-08, M1-09, M1-13)', () => {
  it('expose the documented signatures', () => {
    const xp = xpForAnswer({
      correct: true,
      rating: Rating.Good,
      kind: 'due',
      stabilityDays: 3,
      answeredToday: 0,
    });
    expect(Number.isInteger(xp) && xp >= 0).toBe(true);
    const missed = applyDay(DEFAULT_GAMIFICATION, undefined, '2026-10-18');
    expect(missed.state.streakCurrent).toBe(0);
    expect(missed.day.date).toBe('2026-10-18');
    expect(missed.day.goalMet).toBe(false);
    expect(Array.isArray(missed.events)).toBe(true);
    const practised = { ...emptyDailyProgress('2026-10-19'), minutes: 3, xp: 20 };
    expect(applyDay(DEFAULT_GAMIFICATION, practised, '2026-10-19').day).toMatchObject({
      date: '2026-10-19',
      minutes: 3,
      xp: 20,
    });
    // Idempotent per date: re-settling a date with its own output is a no-op.
    for (const [day, date] of [
      [undefined, '2026-10-18'],
      [{ ...emptyDailyProgress('2026-10-19'), minutes: 10, goalMet: true }, '2026-10-19'],
    ] as const) {
      const first = applyDay(DEFAULT_GAMIFICATION, day, date);
      const again = applyDay(first.state, first.day, date);
      expect(again.events).toEqual([]);
      expect(again.state).toEqual(first.state);
      expect(again.day).toEqual(first.day);
    }
    const ctx = { skillStates: new Map(), gamification: DEFAULT_GAMIFICATION, recentReviews: [] };
    expect(checkAchievements(ctx, new Set(ACHIEVEMENTS.map((a) => a.id)), ACHIEVEMENTS)).toEqual(
      [],
    );
  });

  it('registers only modules with a default-exported definition, in order', () => {
    const badge = (id: string, order: number): AchievementDefinition => ({
      id,
      title: id,
      description: id,
      category: 'streak',
      order,
      isUnlocked: () => false,
    });
    const defs = definitionsFrom({
      './streak-30.ts': { default: badge('streak-30', 2) },
      './helpers.ts': {},
      './streak-7.ts': { default: badge('streak-7', 1) },
      './streak-7b.ts': { default: badge('streak-7b', 1) },
    });
    expect(defs.map((d) => d.id)).toEqual(['streak-7', 'streak-7b', 'streak-30']);
  });
});
