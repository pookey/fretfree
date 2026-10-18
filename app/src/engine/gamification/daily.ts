import type { DailyProgressRecord } from '../../storage/gamification-model';
import type { LocalDate } from './local-date';

/** A date with no practice yet (design §3.7 `DailyProgress`). */
export function emptyDailyProgress(date: LocalDate): DailyProgressRecord {
  return { date, xp: 0, minutes: 0, goalMet: false, freezeUsed: false, questsCompleted: [] };
}
