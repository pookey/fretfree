import type { LocalDate } from '../../engine/gamification/local-date';
import { getDailyProgress, getGamification, type FretworkDB } from '../../storage';
import { goalProgress, type GoalProgress } from './progress';

/** What the Today hero and the sidebar badge show (design §3.7, §7 Today). */
export interface StreakSummary {
  streak: number;
  freezesHeld: number;
  goal: GoalProgress;
}

export async function loadStreakSummary(db: FretworkDB, today: LocalDate): Promise<StreakSummary> {
  const [g, day] = await Promise.all([getGamification(db), getDailyProgress(db, today)]);
  const goal = goalProgress(day.minutes, g.dailyGoalMinutes);
  // The runner may flip `goalMet` on its own terms (M1-10); trust it if set.
  return {
    streak: g.streakCurrent,
    freezesHeld: g.freezesHeld,
    goal: day.goalMet ? { ...goal, fraction: 1, met: true } : goal,
  };
}
