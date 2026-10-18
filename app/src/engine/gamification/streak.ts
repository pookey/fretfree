import { emptyDailyProgress } from './daily';
import type { DailyProgressRecord, DayResult, GamificationRecord, LocalDate } from './types';

/**
 * Settle one local date against the streak rules (design §3.7 streak rows).
 * Pure: returns the new state, the settled date's progress and the events to
 * log; never reads the clock.
 *
 * `day` is that date's progress, or `undefined` if the learner didn't practise.
 *
 * When to settle (forgiving by design, §3.7):
 * - A date is *missed* only once it is over. Settle every date strictly
 *   before today that has not been settled yet, in order, including dates
 *   with no practice (`day` undefined).
 * - Settle today only once its goal is met. Never settle today with
 *   `goalMet: false`: that would break the streak or burn a freeze before
 *   the day has ended.
 *
 * Contract for M1-09, which replaces this stub:
 * - The returned `day` is the settled date's record (`day` or an empty one,
 *   with `date` set). The caller stores it with `commitGamification`.
 * - Meeting the daily goal (`day.goalMet`) extends the streak once per date
 *   (`streak-extended`, with `milestone` at 7, 30, 100 and 365).
 * - 1 freeze is earned per 7-day streak, at most 2 held. A missed date uses a
 *   freeze automatically: `freeze-used`, and the returned `day` has
 *   `freezeUsed: true`, so the streak calendar can show it.
 * - With `weekendAmulet`, Saturday and Sunday neither extend nor break it.
 * - A missed date with no freeze breaks the streak (`streak-broken`) and sets
 *   `streakRepairDeadline` to 48 hours after `startOfLocalDay` of the day
 *   after the missed date. A double session (minutes ≥ 2 ×
 *   `dailyGoalMinutes`) on a date whose `startOfLocalDay` is before
 *   `streakRepairDeadline` restores the streak (`streak-repaired`) and clears
 *   the deadline.
 * - `streakLongest` never decreases.
 */
export function applyDay(
  state: GamificationRecord,
  day: DailyProgressRecord | undefined,
  date: LocalDate,
): DayResult {
  return { state, day: day ?? emptyDailyProgress(date), events: [] };
}
