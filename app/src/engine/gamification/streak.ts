import { emptyDailyProgress } from './daily';
import { addDays, isWeekend, startOfLocalDay, toLocalDate } from './local-date';
import type {
  DailyProgressRecord,
  DayResult,
  GamificationEvent,
  GamificationRecord,
  LocalDate,
} from './types';

/**
 * The streak rules from design §3.7. They are product rules rather than
 * tuning knobs, so they live here until `ENGINE_CONFIG.gamification` exists.
 */
export const STREAK_RULES = {
  /** Streak lengths that are celebrated. */
  milestones: [7, 30, 100, 365],
  /** One freeze is earned each time the streak reaches a multiple of this. */
  freezeEvery: 7,
  maxFreezes: 2,
  /** A repair needs this many times the daily goal on one date. */
  repairGoalMultiple: 2,
  /** The repair window covers this many calendar dates after the missed one. */
  repairWindowDates: 2,
} as const;

/**
 * Settle one local date against the streak rules (design §3.7 streak rows).
 * Pure: returns the new state, the settled date's progress and the events to
 * log; never reads the clock.
 *
 * `day` is that date's stored `dailyProgress` row, or `undefined` if there is
 * none (no practice).
 *
 * When to settle (forgiving by design, §3.7). On app open and at session
 * finish the caller:
 * 1. settles each date of `datesToSettle(state, today)` in order. These are
 *    all over, so a date without its goal met is *missed*;
 * 2. settles today only when its goal is met, and again whenever today's
 *    minutes grow while a repair window is open (a repair may now qualify).
 *    Today is never settled with `goalMet: false`: that would break the
 *    streak or burn a freeze before the day has ended.
 * Then it stores every returned `day` and event with `commitGamification`.
 * `applyDay` trusts that order: a goal-met date always adds 1 to the streak,
 * since any gap before it has already been settled (covered or broken).
 *
 * The rules, applied in this order:
 * 1. Settling a date on or after `toLocalDate(streakRepairDeadline)` first
 *    closes an unrepaired window (deadline cleared, `streakBeforeBreak = 0`,
 *    `streakCurrent` untouched). This happens before the no-op checks below,
 *    so a missed date with the streak at 0 still closes it. Until then the UI
 *    treats a deadline in the past as closed.
 * 2. Meeting the daily goal (`day.goalMet`) extends the streak once per date
 *    and sets `lastGoalMetDate` (`streak-extended`, with `milestone` at 7, 30,
 *    100 and 365). Each multiple of 7 earns a freeze while fewer than 2 are
 *    held (`freezeEarned`).
 * 3. A double session (minutes ≥ 2 × `dailyGoalMinutes`, goal met) on `M+1`
 *    or `M+2` of an open window repairs: the date counts once in the run as
 *    usual, then `streakCurrent = streakBeforeBreak + streakCurrent`,
 *    `streak-repaired` reports the result, and the deadline and
 *    `streakBeforeBreak` are cleared. Example: break after 10, single goal on
 *    `M+1`, double on `M+2` → 12.
 * 4. A missed date (goal not met) is, in order:
 *    - ignored with `weekendAmulet` on a Saturday or Sunday;
 *    - covered by a held freeze: `freeze-used`, and the returned `day` has
 *      `freezeUsed: true`, so the streak calendar can show it;
 *    - inside an open window, a reset of the in-window run to 0 (no new
 *      `streak-broken`; the deadline and `streakBeforeBreak` stay);
 *    - otherwise a break (`streak-broken`): `streakBeforeBreak` keeps the
 *      ended count, `streakCurrent = 0`, and a repair window opens over the
 *      next two calendar dates, `M+1` and `M+2`. `streakRepairDeadline` is
 *      `startOfLocalDay(M+3)`, the instant the window ends, shown as "48
 *      hours". It is defined in calendar dates so a DST change inside the
 *      window neither adds nor removes a day. (It is read in the device's
 *      current zone, so a zone change mid-window can move the boundary by a
 *      date.)
 * `streakLongest` never decreases.
 *
 * Repair jumps. A repair makes the streak jump (e.g. 2 → 12). The jump
 * credits each threshold it crosses that neither the pre-break run nor the
 * in-window run already reached: thresholds in
 * `(max(streakBeforeBreak, run), repaired]`. So a milestone reached only by
 * the repair is celebrated once (`streak-repaired.milestone`), and a freeze
 * is earned for a multiple of 7 crossed only by the repair
 * (`streak-repaired.freezeEarned`, still capped at 2). A freeze earned at day
 * 7 before the break is never earned again for the same day. The window is
 * at most two dates and milestones are further apart, so a jump crosses at
 * most one milestone.
 *
 * Idempotent per date. Re-settling a date with its stored row returns the
 * state unchanged and no events when:
 * - `date <= lastGoalMetDate` (already counted), or
 * - `day.freezeUsed` is already true (already covered), or
 * - the date is missed while `streakCurrent === 0`. After a missed date is
 *   first settled the streak is 0 (or a freeze covered it), and it only rises
 *   on a later goal-met date, which moves `lastGoalMetDate` past it. This
 *   also means a missed date inside a window whose run is 0 burns no freeze.
 * The one exception is a repair, which may fire on a re-settle of a counted
 * date once its minutes reach a double session.
 */
export function applyDay(
  state: GamificationRecord,
  day: DailyProgressRecord | undefined,
  date: LocalDate,
): DayResult {
  let next = closeExpiredWindow(state, date);
  const settled: DailyProgressRecord = { ...(day ?? emptyDailyProgress(date)), date };
  const events: GamificationEvent[] = [];
  const counted = next.lastGoalMetDate !== null && date <= next.lastGoalMetDate;

  if (settled.goalMet) {
    if (!counted) {
      const previous = next.streakCurrent;
      const streak = previous + 1;
      const earned = earnsFreeze(previous, streak, next.freezesHeld);
      next = {
        ...next,
        streakCurrent: streak,
        streakLongest: Math.max(next.streakLongest, streak),
        lastGoalMetDate: date,
        freezesHeld: next.freezesHeld + (earned ? 1 : 0),
      };
      events.push({
        type: 'streak-extended',
        date,
        streak,
        ...withMilestone(previous, streak),
        ...(earned && { freezeEarned: true }),
      });
    }
    if (repairs(next, settled, date)) next = repair(next, date, events);
    return { state: next, day: settled, events };
  }

  if (counted || settled.freezeUsed || next.streakCurrent === 0) {
    return { state: next, day: settled, events };
  }
  if (next.weekendAmulet && isWeekend(date)) {
    return { state: next, day: settled, events };
  }
  if (next.freezesHeld > 0) {
    next = { ...next, freezesHeld: next.freezesHeld - 1 };
    events.push({ type: 'freeze-used', date, freezesLeft: next.freezesHeld });
    return { state: next, day: { ...settled, freezeUsed: true }, events };
  }
  if (next.streakRepairDeadline !== null) {
    return { state: { ...next, streakCurrent: 0 }, day: settled, events };
  }
  const repairDeadline = startOfLocalDay(addDays(date, STREAK_RULES.repairWindowDates + 1));
  events.push({
    type: 'streak-broken',
    date,
    previousStreak: next.streakCurrent,
    repairDeadline,
  });
  next = {
    ...next,
    streakBeforeBreak: next.streakCurrent,
    streakCurrent: 0,
    streakRepairDeadline: repairDeadline,
  };
  return { state: next, day: settled, events };
}

/** Rule 1: an unrepaired window closes once a date on or after its end is settled. */
function closeExpiredWindow(state: GamificationRecord, date: LocalDate): GamificationRecord {
  const deadline = state.streakRepairDeadline;
  if (deadline === null || date < toLocalDate(deadline)) return state;
  return { ...state, streakRepairDeadline: null, streakBeforeBreak: 0 };
}

/** Whether `date` is `M+1` or `M+2` of an open window and its minutes are a double session. */
function repairs(state: GamificationRecord, day: DailyProgressRecord, date: LocalDate): boolean {
  const deadline = state.streakRepairDeadline;
  if (deadline === null) return false;
  const end = toLocalDate(deadline);
  const start = addDays(end, -STREAK_RULES.repairWindowDates);
  const double = day.minutes >= STREAK_RULES.repairGoalMultiple * state.dailyGoalMinutes;
  return double && date >= start && date < end;
}

function repair(
  state: GamificationRecord,
  date: LocalDate,
  events: GamificationEvent[],
): GamificationRecord {
  const run = state.streakCurrent;
  const streak = state.streakBeforeBreak + run;
  const credited = Math.max(state.streakBeforeBreak, run);
  const earned = earnsFreeze(credited, streak, state.freezesHeld);
  events.push({
    type: 'streak-repaired',
    date,
    streak,
    ...withMilestone(credited, streak),
    ...(earned && { freezeEarned: true }),
  });
  return {
    ...state,
    streakCurrent: streak,
    streakLongest: Math.max(state.streakLongest, streak),
    freezesHeld: state.freezesHeld + (earned ? 1 : 0),
    streakRepairDeadline: null,
    streakBeforeBreak: 0,
  };
}

/** A freeze is earned when `(from, to]` contains a multiple of 7 and fewer than 2 are held. */
function earnsFreeze(from: number, to: number, held: number): boolean {
  const every = STREAK_RULES.freezeEvery;
  return held < STREAK_RULES.maxFreezes && Math.floor(to / every) > Math.floor(from / every);
}

/** `{ milestone }` for the highest milestone in `(from, to]`, or nothing. */
function withMilestone(from: number, to: number): { milestone?: number } {
  const hit = STREAK_RULES.milestones.filter((m) => m > from && m <= to);
  const milestone = hit[hit.length - 1];
  return milestone === undefined ? {} : { milestone };
}
