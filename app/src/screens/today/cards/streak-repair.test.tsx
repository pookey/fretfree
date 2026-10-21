import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { emptyDailyProgress } from '../../../engine/gamification/daily';
import { startOfLocalDay } from '../../../engine/gamification/local-date';
import { settleStreak } from '../../../session/gamification-bridge';
import {
  DEFAULT_GAMIFICATION,
  FretworkDB,
  getGamification,
  saveDailyProgress,
  saveGamification,
} from '../../../storage';
import { Card, byWhen, repairView } from './streak-repair';

// Tuesday 20 October 2026. A 10-day streak last met its goal on Sunday the
// 18th, so Monday the 19th broke it: the window is Tuesday and Wednesday.
const now = new Date(2026, 9, 20, 9, 0);
const clock = () => now;
const deadline = startOfLocalDay('2026-10-22');
const broken = {
  dailyGoalMinutes: 10 as const,
  streakCurrent: 0,
  streakLongest: 10,
  lastGoalMetDate: '2026-10-18',
  streakBeforeBreak: 10,
  streakRepairDeadline: deadline,
};

let db: FretworkDB;
let n = 0;

beforeEach(async () => {
  db = new FretworkDB(`streak-repair-card-test-${n++}`);
  await db.open();
});

afterEach(async () => {
  await db.delete();
});

async function practisedToday(minutes: number): Promise<void> {
  await saveDailyProgress(db, {
    ...emptyDailyProgress('2026-10-20'),
    minutes,
    goalMet: minutes >= broken.dailyGoalMinutes,
  });
}

const progress = () => screen.getByRole('progressbar', { name: 'Double session today' });

describe('Today streak-repair card', () => {
  it('offers the repair while the window is open', async () => {
    await saveGamification(db, broken);
    render(<Card db={db} now={clock} />);

    const card = await screen.findByRole('region', { name: 'Bring back your 10-day streak' });
    expect(card).toBeVisible();
    expect(screen.getByTestId('streak-repair-copy')).toHaveTextContent(
      'Your 10-day streak broke. Practise 2× your goal (20 min in one day) by the end of Wednesday to restore it.',
    );
    expect(progress()).toHaveAttribute('aria-valuenow', '0');
    expect(progress()).toHaveAttribute('aria-valuemax', '20');
    expect(screen.getByTestId('streak-repair-progress')).toHaveTextContent('0 / 20 min today');
  });

  it('shows progress toward the doubled goal as today’s minutes grow', async () => {
    await saveGamification(db, broken);
    await practisedToday(7);
    render(<Card db={db} now={clock} />);

    expect(await screen.findByTestId('streak-repair-progress')).toHaveTextContent(
      '7 / 20 min today',
    );
    expect(progress()).toHaveAttribute('aria-valuetext', '7 of 20 minutes');

    // Live: a session writing today's progress moves the meter without a reload.
    await practisedToday(12);
    expect(await screen.findByText('12 / 20 min today')).toBeVisible();
    expect(progress()).toHaveAttribute('aria-valuenow', '12');
  });

  it('moves to the new day’s minutes at local midnight while Today stays open', async () => {
    await saveGamification(db, broken);
    await practisedToday(7);
    await saveDailyProgress(db, { ...emptyDailyProgress('2026-10-21'), minutes: 3 });
    // 100 ms before midnight, then the clock moves into Wednesday.
    let at = new Date(2026, 9, 20, 23, 59, 59, 900);
    render(<Card db={db} now={() => at} />);
    expect(await screen.findByText('7 / 20 min today')).toBeVisible();

    at = new Date(2026, 9, 21, 0, 0, 1);
    expect(await screen.findByText('3 / 20 min today')).toBeVisible();
    expect(screen.getByTestId('streak-repair-copy')).toHaveTextContent('by the end of today');
  });

  it('says the streak is on its way once the double session is done', async () => {
    await saveGamification(db, broken);
    await practisedToday(20);
    render(<Card db={db} now={clock} />);
    expect(
      await screen.findByText(
        'Double session done. Your streak is restored when you end a session or next open FretFree.',
      ),
    ).toBeVisible();
  });

  it('goes once the double session restores the streak', async () => {
    await saveGamification(db, broken);
    await practisedToday(10);
    render(<Card db={db} now={clock} />);
    expect(await screen.findByTestId('streak-repair')).toBeVisible();

    // The engine repairs at settle: 10 + today's 1 = 11.
    await practisedToday(20);
    await settleStreak(db, now);
    expect((await getGamification(db)).streakCurrent).toBe(11);
    await expect.poll(() => screen.queryByTestId('streak-repair')).toBeNull();
  });

  it('stays hidden once the deadline has passed, even before the engine closes the window', async () => {
    await saveGamification(db, broken);
    render(<Card db={db} now={() => new Date(2026, 9, 22, 0, 0)} />);
    // Let the live query resolve before asserting absence.
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByTestId('streak-repair')).toBeNull();
  });

  it('stays hidden with no repair window', async () => {
    await saveGamification(db, { streakCurrent: 4 });
    render(<Card db={db} now={clock} />);
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByTestId('streak-repair')).toBeNull();
  });
});

describe('repairView', () => {
  const day = emptyDailyProgress('2026-10-20');
  const g = { ...DEFAULT_GAMIFICATION, ...broken };

  it('is null without a deadline, without a streak to restore, or after the deadline', () => {
    expect(repairView({ ...g, streakRepairDeadline: null }, day, now)).toBeNull();
    expect(repairView({ ...g, streakBeforeBreak: 0 }, day, now)).toBeNull();
    expect(repairView(g, day, deadline)).toBeNull();
  });

  it('doubles the goal, clamps the fraction and names the last repairing day', () => {
    expect(repairView({ ...g, dailyGoalMinutes: 5 }, { ...day, minutes: 25.6 }, now)).toEqual({
      brokenStreak: 10,
      targetMinutes: 10,
      minutes: 25,
      fraction: 1,
      lastDay: '2026-10-21',
      deadline,
    });
  });
});

describe('byWhen', () => {
  it('says "today" on the last day and names the weekday before it, in English', () => {
    expect(byWhen('2026-10-21', new Date(2026, 9, 21, 20, 0))).toBe('by the end of today');
    expect(byWhen('2026-10-21', now)).toBe('by the end of Wednesday');
  });
});
