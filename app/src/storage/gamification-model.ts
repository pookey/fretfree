/** Design §3.7 data model. The gamification logic itself lands in M1. */

export type DailyGoalMinutes = 5 | 10 | 15 | 20;

export interface GamificationRecord {
  dailyGoalMinutes: DailyGoalMinutes;
  xpTotal: number;
  streakCurrent: number;
  streakLongest: number;
  /** Local calendar date, `YYYY-MM-DD`. */
  lastGoalMetDate: string | null;
  freezesHeld: number;
  weekendAmulet: boolean;
  streakRepairDeadline: Date | null;
}

export interface DailyProgressRecord {
  /** Local calendar date, `YYYY-MM-DD`. */
  date: string;
  xp: number;
  minutes: number;
  goalMet: boolean;
  freezeUsed: boolean;
  questsCompleted: string[];
}

export interface AchievementRecord {
  id: string;
  unlockedAt: Date;
}

/** Every gamification event is logged locally (design §3.7, engine wiring). */
export interface GamificationEventRecord {
  id?: number;
  type: string;
  at: Date;
  data?: Record<string, unknown>;
}

export const DEFAULT_GAMIFICATION: GamificationRecord = {
  dailyGoalMinutes: 10,
  xpTotal: 0,
  streakCurrent: 0,
  streakLongest: 0,
  lastGoalMetDate: null,
  freezesHeld: 0,
  weekendAmulet: false,
  streakRepairDeadline: null,
};
