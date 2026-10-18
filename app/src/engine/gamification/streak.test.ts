import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_GAMIFICATION } from '../../storage/gamification-model';
import { datesToSettle, emptyDailyProgress } from './daily';
import { addDays, daysBetween, startOfLocalDay, toLocalDate } from './local-date';
import { applyDay, STREAK_RULES } from './streak';
import type {
  DailyProgressRecord,
  GamificationEvent,
  GamificationRecord,
  LocalDate,
} from './types';

const GOAL = DEFAULT_GAMIFICATION.dailyGoalMinutes;
const HOUR = 3_600_000;

/** Run in a device time zone. Node re-reads `TZ` whenever `process.env.TZ` is assigned. */
function inZone(tz: string): void {
  vi.stubEnv('TZ', tz);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

/** A stored progress row; the goal is met at `GOAL` minutes. */
function row(date: LocalDate, minutes: number): DailyProgressRecord {
  return { ...emptyDailyProgress(date), minutes, xp: minutes * 10, goalMet: minutes >= GOAL };
}

function state(patch: Partial<GamificationRecord> = {}): GamificationRecord {
  return { ...DEFAULT_GAMIFICATION, ...patch };
}

/** A state whose streak of `n` ended with the goal met on `last`. */
function streakOf(n: number, last: LocalDate, patch: Partial<GamificationRecord> = {}) {
  return state({ streakCurrent: n, streakLongest: n, lastGoalMetDate: last, ...patch });
}

/**
 * Plays the caller's loop (see `applyDay`): each `today` settles the past
 * dates from `datesToSettle`, then today if its goal is met. `minutes` maps a
 * date to that day's practice; unlisted dates have none. Rows are stored as
 * returned, like `commitGamification`.
 */
function live(
  start: GamificationRecord,
  minutes: Record<LocalDate, number>,
  from: LocalDate,
  to: LocalDate,
) {
  let current = start;
  const rows = new Map<LocalDate, DailyProgressRecord>();
  const events: GamificationEvent[] = [];
  const settle = (day: DailyProgressRecord | undefined, date: LocalDate) => {
    const result = applyDay(current, day, date);
    current = result.state;
    rows.set(date, result.day);
    events.push(...result.events);
  };
  for (let today = from; today <= to; today = addDays(today, 1)) {
    for (const date of datesToSettle(current, today)) settle(rows.get(date), date);
    const practised = minutes[today];
    if (practised !== undefined) {
      const todays = row(today, practised);
      rows.set(today, todays);
      if (todays.goalMet) settle(todays, today);
    }
  }
  return { state: current, rows, events };
}

/** `minutes` for every date in `[from, to]`. */
function daily(from: LocalDate, to: LocalDate, minutes = GOAL): Record<LocalDate, number> {
  const plan: Record<LocalDate, number> = {};
  for (let d = from; d <= to; d = addDays(d, 1)) plan[d] = minutes;
  return plan;
}

function ofType<T extends GamificationEvent['type']>(events: GamificationEvent[], type: T) {
  return events.filter((e): e is Extract<GamificationEvent, { type: T }> => e.type === type);
}

describe('applyDay: the returned day', () => {
  it('is an empty record with the date set when there is no row', () => {
    expect(applyDay(state(), undefined, '2026-10-18').day).toEqual(
      emptyDailyProgress('2026-10-18'),
    );
  });

  it('keeps the stored row and its fields', () => {
    const day = { ...row('2026-10-18', 12), questsCompleted: ['clear-due'] };
    expect(applyDay(state(), day, '2026-10-18').day).toEqual(day);
  });
});

describe('applyDay: meeting the daily goal', () => {
  it('starts a streak on the first goal-met date', () => {
    const { state: s, events } = applyDay(state(), row('2026-10-18', GOAL), '2026-10-18');
    expect(s).toEqual(state({ streakCurrent: 1, streakLongest: 1, lastGoalMetDate: '2026-10-18' }));
    expect(events).toEqual([{ type: 'streak-extended', date: '2026-10-18', streak: 1 }]);
  });

  it('extends once per date', () => {
    const first = applyDay(streakOf(3, '2026-10-17'), row('2026-10-18', GOAL), '2026-10-18');
    expect(first.state.streakCurrent).toBe(4);
    const again = applyDay(first.state, row('2026-10-18', GOAL * 3), '2026-10-18');
    expect(again.state).toEqual(first.state);
    expect(again.events).toEqual([]);
  });

  it('does not extend for practice below the goal', () => {
    const s = streakOf(3, '2026-10-17');
    // Only past dates are settled without their goal; this one is missed.
    const result = applyDay(s, row('2026-10-18', GOAL - 1), '2026-10-18');
    expect(result.state.streakCurrent).toBe(0);
    expect(ofType(result.events, 'streak-extended')).toEqual([]);
  });

  it('ignores a goal-met row for a date already counted', () => {
    const s = streakOf(5, '2026-10-18');
    const result = applyDay(s, row('2026-10-16', GOAL), '2026-10-16');
    expect(result.state).toEqual(s);
    expect(result.events).toEqual([]);
  });

  it('raises streakLongest only past the old best', () => {
    const s = streakOf(2, '2026-10-17', { streakLongest: 40 });
    expect(applyDay(s, row('2026-10-18', GOAL), '2026-10-18').state.streakLongest).toBe(40);
    const t = streakOf(40, '2026-10-17');
    expect(applyDay(t, row('2026-10-18', GOAL), '2026-10-18').state.streakLongest).toBe(41);
  });
});

describe('applyDay: milestones and earned freezes over a year of practice', () => {
  // 400 days from 2027-12-01 cross a month, a year and the 2028 leap day.
  const from = '2027-12-01';
  const to = addDays(from, 399);
  const { state: s, events } = live(state(), daily(from, to), from, to);
  const extended = ofType(events, 'streak-extended');

  it('extends the streak every day', () => {
    expect(s.streakCurrent).toBe(400);
    expect(s.streakLongest).toBe(400);
    expect(s.lastGoalMetDate).toBe(to);
    expect(extended.map((e) => e.streak)).toEqual(Array.from({ length: 400 }, (_, i) => i + 1));
    expect(extended.find((e) => e.date === '2028-02-29')?.streak).toBe(91);
    expect(extended.find((e) => e.date === '2028-01-01')?.streak).toBe(32);
  });

  it('celebrates 7, 30, 100 and 365 days and nothing else', () => {
    expect(extended.filter((e) => e.milestone !== undefined)).toEqual([
      {
        type: 'streak-extended',
        date: addDays(from, 6),
        streak: 7,
        milestone: 7,
        freezeEarned: true,
      },
      { type: 'streak-extended', date: addDays(from, 29), streak: 30, milestone: 30 },
      { type: 'streak-extended', date: addDays(from, 99), streak: 100, milestone: 100 },
      { type: 'streak-extended', date: addDays(from, 364), streak: 365, milestone: 365 },
    ]);
    expect(STREAK_RULES.milestones).toEqual([7, 30, 100, 365]);
  });

  it('earns a freeze at 7 and 14, then holds at most 2', () => {
    expect(extended.filter((e) => e.freezeEarned).map((e) => e.streak)).toEqual([7, 14]);
    expect(s.freezesHeld).toBe(2);
  });

  it('never has unsettled dates or freezes used', () => {
    expect(ofType(events, 'freeze-used')).toEqual([]);
    expect(ofType(events, 'streak-broken')).toEqual([]);
  });
});

describe('applyDay: freezes', () => {
  it('earns a freeze again at the next multiple of 7 once one is spent', () => {
    // 1-14 practised (2 freezes), 15 missed (1 left), 16-21 practised: day 20 of the streak.
    const plan = { ...daily('2026-10-01', '2026-10-14'), ...daily('2026-10-16', '2026-10-21') };
    const { state: s, events, rows } = live(state(), plan, '2026-10-01', '2026-10-21');
    expect(rows.get('2026-10-15')?.freezeUsed).toBe(true);
    expect(s.streakCurrent).toBe(20);
    expect(s.freezesHeld).toBe(1);
    expect(ofType(events, 'streak-extended').filter((e) => e.freezeEarned).length).toBe(2);
    const more = live(s, daily('2026-10-22', '2026-10-22'), '2026-10-22', '2026-10-22');
    expect(more.state.streakCurrent).toBe(21);
    expect(more.state.freezesHeld).toBe(2);
    expect(more.events).toEqual([
      { type: 'streak-extended', date: '2026-10-22', streak: 21, freezeEarned: true },
    ]);
  });

  it('covers a missed date automatically, and the streak continues', () => {
    const s = streakOf(8, '2026-10-17', { freezesHeld: 1 });
    const missed = applyDay(s, undefined, '2026-10-18');
    expect(missed.state).toEqual({ ...s, freezesHeld: 0 });
    expect(missed.day).toEqual({ ...emptyDailyProgress('2026-10-18'), freezeUsed: true });
    expect(missed.events).toEqual([{ type: 'freeze-used', date: '2026-10-18', freezesLeft: 0 }]);
    const next = applyDay(missed.state, row('2026-10-19', GOAL), '2026-10-19');
    expect(next.state.streakCurrent).toBe(9);
  });

  it('covers a date with some practice below the goal and keeps that practice', () => {
    const s = streakOf(8, '2026-10-17', { freezesHeld: 2 });
    const missed = applyDay(s, row('2026-10-18', 4), '2026-10-18');
    expect(missed.day).toEqual({ ...row('2026-10-18', 4), freezeUsed: true });
    expect(missed.state.freezesHeld).toBe(1);
  });

  it('covers a two-date gap with two freezes and breaks on the third (several-day gap)', () => {
    const s = streakOf(20, '2026-10-12', { freezesHeld: 2 });
    const { state: t, events, rows } = live(s, { '2026-10-17': GOAL }, '2026-10-13', '2026-10-17');
    expect(rows.get('2026-10-13')?.freezeUsed).toBe(true);
    expect(rows.get('2026-10-14')?.freezeUsed).toBe(true);
    expect(rows.get('2026-10-15')?.freezeUsed).toBe(false);
    expect(events.map((e) => e.type)).toEqual([
      'freeze-used',
      'freeze-used',
      'streak-broken',
      'streak-extended',
    ]);
    // The break on the 15th opened a window over the 16th and 17th; the 16th
    // (run 0) changed nothing and the 17th started a new run.
    expect(t).toMatchObject({
      streakCurrent: 1,
      streakLongest: 20,
      lastGoalMetDate: '2026-10-17',
      freezesHeld: 0,
      streakBeforeBreak: 20,
      streakRepairDeadline: startOfLocalDay('2026-10-18'),
    });
  });

  it('is not burned twice when a covered date is re-settled', () => {
    const s = streakOf(8, '2026-10-17', { freezesHeld: 2 });
    const first = applyDay(s, undefined, '2026-10-18');
    const again = applyDay(first.state, first.day, '2026-10-18');
    expect(again.state.freezesHeld).toBe(1);
    expect(again.events).toEqual([]);
  });
});

describe('applyDay: weekend amulet', () => {
  // 2026-10-16 is a Friday, 17 Saturday, 18 Sunday, 19 Monday.
  it('skips a missed Saturday and Sunday without using a freeze', () => {
    const s = streakOf(5, '2026-10-16', { weekendAmulet: true, freezesHeld: 1 });
    const { state: t, events, rows } = live(s, { '2026-10-19': GOAL }, '2026-10-17', '2026-10-19');
    expect(t.streakCurrent).toBe(6);
    expect(t.freezesHeld).toBe(1);
    expect(rows.get('2026-10-17')?.freezeUsed).toBe(false);
    expect(events).toEqual([{ type: 'streak-extended', date: '2026-10-19', streak: 6 }]);
  });

  it('still counts practice on a weekend', () => {
    const s = streakOf(5, '2026-10-16', { weekendAmulet: true });
    expect(applyDay(s, row('2026-10-17', GOAL), '2026-10-17').state.streakCurrent).toBe(6);
  });

  it('does not cover weekdays', () => {
    const s = streakOf(5, '2026-10-15', { weekendAmulet: true });
    expect(ofType(applyDay(s, undefined, '2026-10-16').events, 'streak-broken')).toHaveLength(1);
  });

  it('breaks on a weekend when it is off', () => {
    const s = streakOf(5, '2026-10-16');
    expect(ofType(applyDay(s, undefined, '2026-10-17').events, 'streak-broken')).toHaveLength(1);
  });

  it('skips a weekend across a month and year boundary', () => {
    // 2027-01-02 is a Saturday, 2027-01-03 a Sunday.
    const s = streakOf(9, '2027-01-01', { weekendAmulet: true });
    const { state: t } = live(s, { '2027-01-04': GOAL }, '2027-01-02', '2027-01-04');
    expect(t.streakCurrent).toBe(10);
    const m = streakOf(9, '2026-01-30', { weekendAmulet: true }); // Fri; Jan 31 is a Saturday.
    expect(live(m, { '2026-02-02': GOAL }, '2026-01-31', '2026-02-02').state.streakCurrent).toBe(
      10,
    );
  });
});

describe('applyDay: breaking a streak', () => {
  it('ends the streak and opens a repair window over the next two dates', () => {
    const s = streakOf(10, '2026-10-17', { streakLongest: 12 });
    const result = applyDay(s, undefined, '2026-10-18');
    const deadline = startOfLocalDay('2026-10-21');
    expect(result.state).toEqual({
      ...s,
      streakCurrent: 0,
      streakLongest: 12,
      streakBeforeBreak: 10,
      streakRepairDeadline: deadline,
    });
    expect(result.day).toEqual(emptyDailyProgress('2026-10-18'));
    expect(result.events).toEqual([
      { type: 'streak-broken', date: '2026-10-18', previousStreak: 10, repairDeadline: deadline },
    ]);
  });

  it('does nothing for a missed date when there is no streak', () => {
    for (const s of [state(), state({ lastGoalMetDate: '2026-10-01', streakLongest: 4 })]) {
      const result = applyDay(s, undefined, '2026-10-18');
      expect(result.state).toEqual(s);
      expect(result.events).toEqual([]);
    }
  });

  it('does not break again on a re-settle', () => {
    const first = applyDay(streakOf(10, '2026-10-17'), undefined, '2026-10-18');
    const again = applyDay(first.state, first.day, '2026-10-18');
    expect(again.state).toEqual(first.state);
    expect(again.events).toEqual([]);
  });
});

describe('applyDay: the repair window', () => {
  // Broken on M = 2026-10-18 after 10 days; the window is the 19th and 20th.
  const M = '2026-10-18';
  const broken = applyDay(streakOf(10, '2026-10-17'), undefined, M).state;

  it('repairs with a double session on M+1', () => {
    const result = applyDay(broken, row('2026-10-19', GOAL * 2), '2026-10-19');
    expect(result.state).toEqual({
      ...broken,
      streakCurrent: 11,
      streakLongest: 11,
      lastGoalMetDate: '2026-10-19',
      streakRepairDeadline: null,
      streakBeforeBreak: 0,
    });
    expect(result.events).toEqual([
      { type: 'streak-extended', date: '2026-10-19', streak: 1 },
      { type: 'streak-repaired', date: '2026-10-19', streak: 11 },
    ]);
  });

  it('keeps practice in the window: single on M+1, double on M+2 gives 12', () => {
    const plan = { '2026-10-19': GOAL, '2026-10-20': GOAL * 2 };
    const { state: s, events } = live(broken, plan, '2026-10-19', '2026-10-20');
    expect(s.streakCurrent).toBe(12);
    expect(s.streakRepairDeadline).toBeNull();
    expect(ofType(events, 'streak-repaired')).toEqual([
      { type: 'streak-repaired', date: '2026-10-20', streak: 12 },
    ]);
  });

  it('repairs on a re-settle once today reaches a double session', () => {
    const single = applyDay(broken, row('2026-10-19', GOAL), '2026-10-19');
    expect(single.state.streakCurrent).toBe(1);
    expect(single.events.map((e) => e.type)).toEqual(['streak-extended']);
    const double = applyDay(single.state, row('2026-10-19', GOAL * 2 + 3), '2026-10-19');
    expect(double.state.streakCurrent).toBe(11);
    expect(double.state.lastGoalMetDate).toBe('2026-10-19');
    expect(double.events).toEqual([{ type: 'streak-repaired', date: '2026-10-19', streak: 11 }]);
    const again = applyDay(double.state, double.day, '2026-10-19');
    expect(again.state).toEqual(double.state);
    expect(again.events).toEqual([]);
  });

  it('measures the double session against the current daily goal', () => {
    const goal20 = { ...broken, dailyGoalMinutes: 20 as const };
    const result = applyDay(goal20, { ...row('2026-10-19', 30), goalMet: true }, '2026-10-19');
    expect(result.state.streakCurrent).toBe(1);
    const enough = applyDay(goal20, { ...row('2026-10-19', 40), goalMet: true }, '2026-10-19');
    expect(enough.state.streakCurrent).toBe(11);
  });

  it('does not repair without the goal met, even with the minutes', () => {
    const result = applyDay(broken, { ...row('2026-10-19', 30), goalMet: false }, '2026-10-19');
    expect(result.state).toEqual(broken);
  });

  it('does not repair on M+3: the window has closed', () => {
    const result = applyDay(broken, row('2026-10-21', GOAL * 2), '2026-10-21');
    expect(result.state).toMatchObject({
      streakCurrent: 1,
      streakLongest: 10,
      streakRepairDeadline: null,
      streakBeforeBreak: 0,
    });
    expect(ofType(result.events, 'streak-repaired')).toEqual([]);
  });

  it('does not repair from a re-settle of a date before the window', () => {
    const s = { ...broken, lastGoalMetDate: '2026-10-17' };
    const result = applyDay(s, row('2026-10-17', GOAL * 2), '2026-10-17');
    expect(result.state).toEqual(s);
    expect(result.events).toEqual([]);
  });

  it('resets the in-window run on a missed M+2 without a new break', () => {
    const plan = { '2026-10-19': GOAL };
    const { state: s, events } = live(broken, plan, '2026-10-19', '2026-10-21');
    // Today is the 21st (M+3): settling the 20th reset the run; nothing settled the 21st yet.
    expect(events.map((e) => e.type)).toEqual(['streak-extended']);
    expect(s).toMatchObject({
      streakCurrent: 0,
      lastGoalMetDate: '2026-10-19',
      streakBeforeBreak: 10,
      streakRepairDeadline: startOfLocalDay('2026-10-21'),
    });
    // Practice on M+3 closes the window first, then starts a fresh run.
    const later = applyDay(s, row('2026-10-21', GOAL * 2), '2026-10-21');
    expect(later.state).toMatchObject({
      streakCurrent: 1,
      streakBeforeBreak: 0,
      streakRepairDeadline: null,
    });
    expect(later.events).toEqual([{ type: 'streak-extended', date: '2026-10-21', streak: 1 }]);
  });

  it('closes after a break and three missed dates, then re-settles as a no-op', () => {
    let s = broken;
    for (const date of ['2026-10-19', '2026-10-20']) {
      const result = applyDay(s, undefined, date);
      expect(result.state).toEqual(s);
      expect(result.events).toEqual([]);
      s = result.state;
    }
    const closing = applyDay(s, undefined, '2026-10-21');
    expect(closing.state).toEqual({
      ...s,
      streakRepairDeadline: null,
      streakBeforeBreak: 0,
    });
    expect(closing.events).toEqual([]);
    const again = applyDay(closing.state, closing.day, '2026-10-21');
    expect(again.state).toEqual(closing.state);
    expect(again.events).toEqual([]);
  });

  it('burns no freeze for a missed date while the in-window run is 0', () => {
    const s = { ...broken, freezesHeld: 1 };
    const result = applyDay(s, undefined, '2026-10-19');
    expect(result.state).toEqual(s);
    expect(result.day.freezeUsed).toBe(false);
  });

  it('closes the window and keeps a held freeze from M+3 on', () => {
    // A window is only ever opened with 0 freezes held, but the order still matters.
    const s = { ...broken, streakCurrent: 1, freezesHeld: 1 };
    const result = applyDay(s, undefined, '2026-10-21');
    expect(result.state).toMatchObject({ freezesHeld: 0, streakRepairDeadline: null });
    expect(result.events).toEqual([{ type: 'freeze-used', date: '2026-10-21', freezesLeft: 0 }]);
  });
});

describe('applyDay: repair jumps', () => {
  function breakAt(previous: number, patch: Partial<GamificationRecord> = {}) {
    return applyDay(streakOf(previous, '2026-10-17', patch), undefined, '2026-10-18').state;
  }

  it('celebrates a milestone crossed only by the repair, once', () => {
    const one = applyDay(breakAt(6), row('2026-10-19', GOAL * 2), '2026-10-19');
    expect(one.events).toEqual([
      { type: 'streak-extended', date: '2026-10-19', streak: 1 },
      { type: 'streak-repaired', date: '2026-10-19', streak: 7, milestone: 7, freezeEarned: true },
    ]);
    expect(one.state.freezesHeld).toBe(1);
    const plan = { '2026-10-19': GOAL, '2026-10-20': GOAL * 2 };
    const thirty = live(breakAt(28), plan, '2026-10-19', '2026-10-20');
    expect(ofType(thirty.events, 'streak-repaired')).toEqual([
      { type: 'streak-repaired', date: '2026-10-20', streak: 30, milestone: 30 },
    ]);
    // The next extension does not celebrate 30 again.
    const after = applyDay(thirty.state, row('2026-10-21', GOAL), '2026-10-21');
    expect(after.events).toEqual([{ type: 'streak-extended', date: '2026-10-21', streak: 31 }]);
  });

  it('does not re-celebrate or re-earn for days credited before the break', () => {
    const plan = { '2026-10-19': GOAL, '2026-10-20': GOAL * 2 };
    const { events, state: s } = live(breakAt(10), plan, '2026-10-19', '2026-10-20');
    expect(ofType(events, 'streak-repaired')).toEqual([
      { type: 'streak-repaired', date: '2026-10-20', streak: 12 },
    ]);
    expect(s.freezesHeld).toBe(0);
    // 13, then 14 earns the freeze for the second week.
    const next = live(s, daily('2026-10-21', '2026-10-22'), '2026-10-21', '2026-10-22');
    expect(ofType(next.events, 'streak-extended').map((e) => e.freezeEarned)).toEqual([
      undefined,
      true,
    ]);
  });

  it('earns a freeze for a multiple of 7 crossed only by the repair, up to the cap', () => {
    const fourteen = applyDay(breakAt(13), row('2026-10-19', GOAL * 2), '2026-10-19');
    expect(fourteen.state).toMatchObject({ streakCurrent: 14, freezesHeld: 1 });
    expect(ofType(fourteen.events, 'streak-repaired')[0]?.freezeEarned).toBe(true);
    // Not reachable through `applyDay` (a break needs 0 freezes), but capped all the same.
    const full = { ...breakAt(13), freezesHeld: 2 };
    const capped = applyDay(full, row('2026-10-19', GOAL * 2), '2026-10-19');
    expect(capped.state.freezesHeld).toBe(2);
    expect(ofType(capped.events, 'streak-repaired')[0]?.freezeEarned).toBeUndefined();
  });

  it('raises streakLongest when the repair beats it', () => {
    const s = applyDay(breakAt(99, { streakLongest: 99 }), row('2026-10-19', 20), '2026-10-19');
    expect(s.state).toMatchObject({ streakCurrent: 100, streakLongest: 100 });
    expect(ofType(s.events, 'streak-repaired')[0]?.milestone).toBe(100);
  });
});

describe('applyDay: calendar edge cases', () => {
  it('crosses a month boundary', () => {
    const { state: s } = live(
      state(),
      daily('2026-01-29', '2026-02-02'),
      '2026-01-29',
      '2026-02-02',
    );
    expect(s.streakCurrent).toBe(5);
    const broken = applyDay(streakOf(4, '2026-01-30'), undefined, '2026-01-31');
    expect(toLocalDate(broken.state.streakRepairDeadline!)).toBe('2026-02-03');
  });

  it('crosses a year boundary, with the window spanning it', () => {
    const broken = applyDay(streakOf(15, '2026-12-29'), undefined, '2026-12-30');
    expect(broken.state.streakRepairDeadline).toEqual(startOfLocalDay('2027-01-02'));
    const repaired = applyDay(broken.state, row('2027-01-01', GOAL * 2), '2027-01-01');
    expect(repaired.state.streakCurrent).toBe(16);
    const late = applyDay(broken.state, row('2027-01-02', GOAL * 2), '2027-01-02');
    expect(late.state.streakCurrent).toBe(1);
  });

  it('crosses the 2028 leap day', () => {
    const broken = applyDay(streakOf(15, '2028-02-26'), undefined, '2028-02-27');
    expect(toLocalDate(broken.state.streakRepairDeadline!)).toBe('2028-03-01');
    const repaired = applyDay(broken.state, row('2028-02-29', GOAL * 2), '2028-02-29');
    expect(repaired.state.streakCurrent).toBe(16);
    expect(
      applyDay(streakOf(15, '2027-02-26'), undefined, '2027-02-27').state.streakRepairDeadline,
    ).toEqual(startOfLocalDay('2027-03-02'));
  });

  it('settles a long absence: one break, then the window closes', () => {
    const s = streakOf(30, '2026-10-01', { freezesHeld: 1 });
    // Back after 9 days away, on the 11th.
    const { state: t, events, rows } = live(s, { '2026-10-11': GOAL }, '2026-10-02', '2026-10-11');
    expect(events.map((e) => [e.type, 'date' in e ? e.date : ''])).toEqual([
      ['freeze-used', '2026-10-02'],
      ['streak-broken', '2026-10-03'],
      ['streak-extended', '2026-10-11'],
    ]);
    expect(rows.get('2026-10-02')?.freezeUsed).toBe(true);
    expect(t).toMatchObject({
      streakCurrent: 1,
      streakLongest: 30,
      freezesHeld: 0,
      lastGoalMetDate: '2026-10-11',
      streakBeforeBreak: 0,
      streakRepairDeadline: null,
    });
  });

  describe.each([
    // Spring forward on 2026-03-08 (a 23-hour day) and fall back on 2026-11-01 (25 hours).
    ['America/New_York', '2026-03-06', 47],
    ['America/New_York', '2026-10-30', 49],
    // Spring forward on 2026-03-29, fall back on 2026-10-25.
    ['Europe/London', '2026-03-27', 47],
    ['Europe/London', '2026-10-23', 49],
    // Chile springs forward at midnight on 2026-09-06: that date starts at 01:00.
    // The skipped hour is the deadline itself, so the window stays 48 hours.
    ['America/Santiago', '2026-09-03', 48],
    ['Australia/Lord_Howe', '2026-10-02', 47.5],
  ] as const)('across DST in %s, broken on %s', (tz, missed, hours) => {
    it(`keeps a two-date window (${hours} hours)`, () => {
      inZone(tz);
      const broken = applyDay(streakOf(10, addDays(missed, -1)), undefined, missed);
      const deadline = broken.state.streakRepairDeadline!;
      expect(toLocalDate(deadline)).toBe(addDays(missed, 3));
      expect(toLocalDate(new Date(deadline.getTime() - 1))).toBe(addDays(missed, 2));
      const opens = startOfLocalDay(addDays(missed, 1)).getTime();
      expect((deadline.getTime() - opens) / HOUR).toBe(hours);
      const lastChance = row(addDays(missed, 2), GOAL * 2);
      expect(applyDay(broken.state, lastChance, lastChance.date).state.streakCurrent).toBe(11);
      const tooLate = row(addDays(missed, 3), GOAL * 2);
      expect(applyDay(broken.state, tooLate, tooLate.date).state.streakCurrent).toBe(1);
    });
  });

  it.each(['Europe/London', 'America/New_York', 'America/Santiago', 'Pacific/Auckland'])(
    'opens a window of exactly M+1 and M+2 for every date of 2026 in %s',
    (tz) => {
      inZone(tz);
      for (let missed = '2026-01-01'; missed < '2027-01-01'; missed = addDays(missed, 1)) {
        const broken = applyDay(streakOf(5, addDays(missed, -1)), undefined, missed).state;
        const end = toLocalDate(broken.streakRepairDeadline!);
        expect(daysBetween(missed, end)).toBe(3);
        for (const [offset, repairs] of [
          [1, true],
          [2, true],
          [3, false],
        ] as const) {
          const date = addDays(missed, offset);
          const after = applyDay(broken, row(date, GOAL * 2), date).state;
          expect(after.streakCurrent).toBe(repairs ? 6 : 1);
        }
      }
    },
  );
});

describe('applyDay: idempotent per date', () => {
  /** A deterministic generator (mulberry32), so failures reproduce. */
  function rng(seed: number): () => number {
    let a = seed;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  it.each([1, 2, 3, 4, 5, 6, 7, 8])(
    're-settling every stored date changes nothing (seed %i)',
    (seed) => {
      const random = rng(seed);
      const from = '2026-11-20';
      const to = addDays(from, 119);
      const plan: Record<LocalDate, number> = {};
      for (let d = from; d <= to; d = addDays(d, 1)) {
        const r = random();
        // Mostly practice, some gaps, some double sessions.
        if (r < 0.7) plan[d] = GOAL;
        else if (r < 0.8) plan[d] = GOAL * 2;
        else if (r < 0.88) plan[d] = Math.floor(random() * GOAL);
      }
      const start = state({ weekendAmulet: seed % 2 === 0 });
      const { state: end, rows, events } = live(start, plan, from, to);
      expect(end.streakLongest).toBeGreaterThanOrEqual(end.streakCurrent);
      // The plan exercises freezes and breaks, and nothing was double-counted.
      expect(ofType(events, 'freeze-used').length).toBeGreaterThan(0);
      expect(ofType(events, 'streak-broken').length).toBeGreaterThan(0);
      const extended = ofType(events, 'streak-extended');
      expect(new Set(extended.map((e) => e.date)).size).toBe(extended.length);
      for (const [date, day] of rows) {
        // Today is only settled once its goal is met.
        if (date === to && !day.goalMet) continue;
        const again = applyDay(end, day, date);
        expect(again.events).toEqual([]);
        expect(again.state).toEqual(end);
        expect(again.day).toEqual(day);
      }
    },
  );

  it('never decreases streakLongest', () => {
    const random = rng(42);
    let s = state();
    let longest = 0;
    for (let d = '2026-01-01', i = 0; i < 500; d = addDays(d, 1), i++) {
      const minutes = random() < 0.75 ? GOAL * (random() < 0.2 ? 2 : 1) : 0;
      s = applyDay(s, row(d, minutes), d).state;
      expect(s.streakLongest).toBeGreaterThanOrEqual(longest);
      expect(s.freezesHeld).toBeLessThanOrEqual(STREAK_RULES.maxFreezes);
      longest = s.streakLongest;
    }
  });
});
