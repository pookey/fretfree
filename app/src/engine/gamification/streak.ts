import type { DailyProgressRecord, DayResult, GamificationRecord, LocalDate } from './types';

/**
 * Settle one local date against the streak rules (design §3.7 streak rows).
 * Pure: returns the new state and the events to log; never reads the clock.
 *
 * `day` is that date's progress, or `undefined` if the learner didn't practise.
 * Call it once per date in order, including skipped dates, up to and
 * including the date being settled.
 *
 * Contract for M1-09, which replaces this stub:
 * - Meeting the daily goal (`day.goalMet`) extends the streak once per date
 *   (`streak-extended`, with `milestone` at 7, 30, 100 and 365).
 * - 1 freeze is earned per 7-day streak, at most 2 held. A missed date uses a
 *   freeze automatically (`freeze-used`, and `day.freezeUsed` is set).
 * - With `weekendAmulet`, Saturday and Sunday neither extend nor break it.
 * - A missed date with no freeze breaks the streak (`streak-broken`) and opens
 *   a 48-hour repair window (`streakRepairDeadline`). A double session
 *   (minutes ≥ 2 × `dailyGoalMinutes`) inside it restores the streak
 *   (`streak-repaired`).
 * - `streakLongest` never decreases.
 */
export function applyDay(
  state: GamificationRecord,
  _day: DailyProgressRecord | undefined,
  _date: LocalDate,
): DayResult {
  return { state, events: [] };
}
