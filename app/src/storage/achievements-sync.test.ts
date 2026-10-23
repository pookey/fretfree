import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Rating } from 'ts-fsrs';
import { ACHIEVEMENTS } from '../engine/gamification/achievements';
import type { ReviewLogRecord } from '../engine/model';
import { latestReviews, loadAchievementContext, syncAchievements } from './achievements-sync';
import { FretworkDB } from './db';
import { getEvents, getUnlockedAchievements, saveGamification } from './gamification-repo';
import { putSkillState, saveSettings } from './repository';

const now = new Date('2026-10-18T09:00:00Z');
let db: FretworkDB;
let n = 0;

beforeEach(async () => {
  db = new FretworkDB(`achievements-sync-test-${n++}`);
  await db.open();
});

afterEach(async () => {
  await db.delete();
});

function log(i: number, over: Partial<ReviewLogRecord> = {}): Omit<ReviewLogRecord, 'id'> {
  return {
    itemId: `note@s6f${i % 13}`,
    skillId: 'F2.string6-naturals',
    drillType: 'name-the-note',
    correct: true,
    responseMs: 800,
    rating: Rating.Easy,
    hintUsed: false,
    answerGiven: 'E',
    at: new Date(now.getTime() + i * 1000),
    ...over,
  };
}

describe('loadAchievementContext', () => {
  it('reads skill states, gamification and the latest reviews, newest last', async () => {
    await putSkillState(db, {
      skillId: 'F2.string6-naturals',
      status: 'mastered',
      guideLevel: 0,
      rollingAccuracy: 0.95,
    });
    await saveGamification(db, { streakLongest: 9 });
    // Added out of time order, so the query must sort by `at`.
    await db.reviewLogs.bulkAdd([log(3), log(1), log(2), log(0)]);

    const ctx = await loadAchievementContext(db, 3);
    expect(ctx.skillStates.get('F2.string6-naturals')?.status).toBe('mastered');
    expect(ctx.gamification.streakLongest).toBe(9);
    expect(ctx.recentReviews.map((r) => r.at.getTime() - now.getTime())).toEqual([
      1000, 2000, 3000,
    ]);
  });

  it('returns empty data on a fresh install', async () => {
    const ctx = await loadAchievementContext(db);
    expect(ctx.skillStates.size).toBe(0);
    expect(ctx.recentReviews).toEqual([]);
    expect(ctx.latencyBaselineMs).toBeNull();
    expect(await latestReviews(db, 10)).toEqual([]);
  });
});

describe('syncAchievements', () => {
  it('unlocks, persists and logs newly earned badges once', async () => {
    await putSkillState(db, {
      skillId: 'F2.string5-naturals',
      status: 'mastered',
      guideLevel: 1,
      rollingAccuracy: 0.92,
    });
    await saveGamification(db, { streakLongest: 7, streakCurrent: 7 });

    const fresh = await syncAchievements(db, ACHIEVEMENTS, now);
    expect(fresh.map((d) => d.id)).toEqual(['string-5-master', 'streak-7']);
    const stored = await getUnlockedAchievements(db);
    expect([...stored.keys()].sort()).toEqual(['streak-7', 'string-5-master']);
    expect(stored.get('streak-7')).toEqual(now);

    // Nothing new the second time, and no duplicate events.
    expect(await syncAchievements(db, ACHIEVEMENTS, new Date(now.getTime() + 1000))).toEqual([]);
    const events = await getEvents(db, { type: 'achievement-unlocked' });
    expect(events).toHaveLength(2);
  });

  it('unlocks speed demon from the stored review log', async () => {
    await db.reviewLogs.bulkAdd(Array.from({ length: 30 }, (_, i) => log(i)));
    expect((await syncAchievements(db, ACHIEVEMENTS, now)).map((d) => d.id)).toEqual([
      'speed-demon',
    ]);
  });

  it('times speed demon against the tap time it is given', async () => {
    await db.reviewLogs.bulkAdd(Array.from({ length: 30 }, (_, i) => log(i, { responseMs: 1500 })));
    expect(await syncAchievements(db, ACHIEVEMENTS, now)).toEqual([]);
    const ctx = await loadAchievementContext(db, undefined, 1100);
    expect(ctx.latencyBaselineMs).toBe(1100);
    expect((await syncAchievements(db, ACHIEVEMENTS, now, ctx)).map((d) => d.id)).toEqual([
      'speed-demon',
    ]);
  });

  it('never reads the settings table, so a settings write cannot wake the watch', async () => {
    await saveSettings(db, { latencyBaselineMs: 1100 });
    const get = vi.spyOn(db.settings, 'get');
    const toArray = vi.spyOn(db.settings, 'toArray');
    const ctx = await loadAchievementContext(db);
    expect(ctx.latencyBaselineMs).toBeNull();
    expect(get).not.toHaveBeenCalled();
    expect(toArray).not.toHaveBeenCalled();
  });

  it('keeps earned badges when the data later regresses', async () => {
    await saveGamification(db, { streakLongest: 7 });
    await syncAchievements(db, ACHIEVEMENTS, now);
    await saveGamification(db, { streakLongest: 0, streakCurrent: 0 });
    expect(await syncAchievements(db, ACHIEVEMENTS, now)).toEqual([]);
    expect((await getUnlockedAchievements(db)).has('streak-7')).toBe(true);
  });

  it('reports each badge to only one of two concurrent syncs', async () => {
    await saveGamification(db, { streakLongest: 30 });
    const [a, b] = await Promise.all([
      syncAchievements(db, ACHIEVEMENTS, now),
      syncAchievements(db, ACHIEVEMENTS, now),
    ]);
    expect([...a, ...b].map((d) => d.id).sort()).toEqual(['streak-30', 'streak-7']);
  });

  it('accepts a preloaded context', async () => {
    const ctx = await loadAchievementContext(db);
    const withStreak = { ...ctx, gamification: { ...ctx.gamification, streakLongest: 100 } };
    expect((await syncAchievements(db, ACHIEVEMENTS, now, withStreak)).map((d) => d.id)).toEqual([
      'streak-7',
      'streak-30',
      'streak-100',
    ]);
  });
});
