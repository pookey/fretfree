import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FretworkDB, saveDailyProgress, saveGamification } from '../../storage';
import { emptyDailyProgress } from '../../engine/gamification/daily';
import { loadStreakSummary } from './streak-summary';

let db: FretworkDB;
let n = 0;

beforeEach(async () => {
  db = new FretworkDB(`streak-summary-${n++}`);
  await db.open();
});

afterEach(async () => {
  await db.delete();
});

describe('loadStreakSummary', () => {
  it('starts at zero with the default 10-minute goal', async () => {
    expect(await loadStreakSummary(db, '2026-10-18')).toEqual({
      streak: 0,
      freezesHeld: 0,
      goal: { minutes: 0, goalMinutes: 10, fraction: 0, met: false },
    });
  });

  it("reads the streak, freezes and today's minutes only", async () => {
    await saveGamification(db, { streakCurrent: 7, freezesHeld: 2, dailyGoalMinutes: 15 });
    await saveDailyProgress(db, { ...emptyDailyProgress('2026-10-17'), minutes: 30 });
    await saveDailyProgress(db, { ...emptyDailyProgress('2026-10-18'), minutes: 6 });
    const s = await loadStreakSummary(db, '2026-10-18');
    expect(s).toMatchObject({ streak: 7, freezesHeld: 2 });
    expect(s.goal).toMatchObject({ minutes: 6, goalMinutes: 15, met: false });
    expect(s.goal.fraction).toBeCloseTo(0.4);
  });

  it('trusts a stored goalMet flag', async () => {
    await saveDailyProgress(db, { ...emptyDailyProgress('2026-10-18'), minutes: 4, goalMet: true });
    const { goal } = await loadStreakSummary(db, '2026-10-18');
    expect(goal).toMatchObject({ minutes: 4, fraction: 1, met: true });
  });
});
