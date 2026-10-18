import { emptyDailyProgress } from './daily';
import type { DailyProgressRecord, DayResult, GamificationRecord, LocalDate } from './types';

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
 *
 * Idempotent per date. Re-settling a date with its stored row returns the
 * state unchanged and no events when:
 * - `date <= lastGoalMetDate` (already counted), or
 * - `day.freezeUsed` is already true (already covered), or
 * - the date is missed while `streakCurrent === 0` or a repair window is open.
 * The one exception is a repair, which may fire on a re-settle (see below).
 *
 * Contract for M1-09, which replaces this stub:
 * - The returned `day` is the settled date's record (`day` or an empty one,
 *   with `date` set).
 * - Meeting the daily goal (`day.goalMet`) extends the streak once per date
 *   and sets `lastGoalMetDate` (`streak-extended`, with `milestone` at 7, 30,
 *   100 and 365).
 * - 1 freeze is earned per 7-day streak, at most 2 held. A missed date uses a
 *   freeze automatically: `freeze-used`, and the returned `day` has
 *   `freezeUsed: true`, so the streak calendar can show it.
 * - With `weekendAmulet`, a missed Saturday or Sunday changes nothing.
 * - A missed date `M` with no freeze breaks the streak (`streak-broken`) and
 *   opens a repair window over the next two calendar dates, `M+1` and `M+2`.
 *   `streakRepairDeadline` is `startOfLocalDay(addDays(M, 3))`, the instant
 *   the window ends, shown as "48 hours". It is defined in calendar dates so
 *   a DST change inside the window neither adds nor removes a day.
 * - While the window is open, `streakCurrent` keeps the pre-break count, so a
 *   repair can restore it, and normal extension is suspended. A further
 *   missed date inside the window changes nothing (the window stays as the
 *   first break set it). A single-goal date inside the window sets
 *   `lastGoalMetDate` but doesn't extend.
 * - A double session (minutes ≥ 2 × `dailyGoalMinutes`) on `M+1` or `M+2`
 *   (`date < toLocalDate(streakRepairDeadline)`) repairs: `streak-repaired`,
 *   `streakCurrent` becomes the kept count + 1 for the repair date,
 *   `lastGoalMetDate = date`, and the deadline is cleared.
 * - Settling a date on or after `toLocalDate(streakRepairDeadline)` first
 *   closes an unrepaired window (`streakCurrent = 0`, deadline cleared), then
 *   settles that date normally. Until then the UI treats a deadline in the
 *   past as closed.
 * - `streakLongest` never decreases.
 */
export function applyDay(
  state: GamificationRecord,
  day: DailyProgressRecord | undefined,
  date: LocalDate,
): DayResult {
  return { state, day: day ?? emptyDailyProgress(date), events: [] };
}
