import type { DailyProgressRecord, GamificationRecord } from '../../storage/gamification-model';
import { addDays, type LocalDate } from './local-date';

/** A date with no practice yet (design §3.7 `DailyProgress`). */
export function emptyDailyProgress(date: LocalDate): DailyProgressRecord {
  return { date, xp: 0, minutes: 0, goalMet: false, freezeUsed: false, questsCompleted: [] };
}

/**
 * The past dates to settle with `applyDay`, oldest first: every date after
 * `lastGoalMetDate` and strictly before `today`. Empty when the goal has never
 * been met, since there is then no streak a missed date could affect.
 *
 * Some of these dates may already have been settled (a freeze, a break, or a
 * repair window). That is safe because `applyDay` is idempotent per date, as
 * long as each date is passed its stored `dailyProgress` row.
 */
export function datesToSettle(
  state: Pick<GamificationRecord, 'lastGoalMetDate'>,
  today: LocalDate,
): LocalDate[] {
  const dates: LocalDate[] = [];
  if (state.lastGoalMetDate === null) return dates;
  for (let d = addDays(state.lastGoalMetDate, 1); d < today; d = addDays(d, 1)) dates.push(d);
  return dates;
}
