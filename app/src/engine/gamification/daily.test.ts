import { describe, expect, it } from 'vitest';
import { datesToSettle, emptyDailyProgress } from './daily';

describe('emptyDailyProgress', () => {
  it('is a day with no practice', () => {
    expect(emptyDailyProgress('2026-10-18')).toEqual({
      date: '2026-10-18',
      xp: 0,
      minutes: 0,
      goalMet: false,
      freezeUsed: false,
      questsCompleted: [],
    });
  });
});

describe('datesToSettle', () => {
  it('is empty before the goal has ever been met', () => {
    expect(datesToSettle({ lastGoalMetDate: null }, '2026-10-18')).toEqual([]);
  });

  it('is empty when the goal was met yesterday or today', () => {
    expect(datesToSettle({ lastGoalMetDate: '2026-10-17' }, '2026-10-18')).toEqual([]);
    expect(datesToSettle({ lastGoalMetDate: '2026-10-18' }, '2026-10-18')).toEqual([]);
  });

  it('lists the dates after the last goal and before today, across a year boundary', () => {
    expect(datesToSettle({ lastGoalMetDate: '2026-12-29' }, '2027-01-02')).toEqual([
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
    ]);
  });
});
