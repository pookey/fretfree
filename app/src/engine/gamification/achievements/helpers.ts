import type { AchievementContext, AchievementDefinition } from '../types';

/**
 * Shared builders for the badge files. No default export, so the registry
 * skips this module.
 */

/**
 * A badge earned when `skillId` reaches `mastered` (design §3.4), or every
 * one of a list of skills does: a milestone a staged topic reaches whole.
 */
export function masteryAchievement(
  def: Omit<AchievementDefinition, 'category' | 'isUnlocked'> & {
    skillId: string | readonly string[];
  },
): AchievementDefinition {
  const { skillId, ...rest } = def;
  const skillIds = typeof skillId === 'string' ? [skillId] : skillId;
  return {
    ...rest,
    category: 'mastery',
    isUnlocked: (ctx: AchievementContext) =>
      skillIds.every((id) => ctx.skillStates.get(id)?.status === 'mastered'),
  };
}

/**
 * A streak milestone badge (7, 30, 100, 365 days). It goes by the longest
 * streak, so a later break never takes it back, and the streak only counts
 * days the daily goal was met.
 */
export function streakAchievement(days: number, order: number): AchievementDefinition {
  return {
    id: `streak-${days}`,
    title: `${days}-day streak`,
    description: `You met your daily goal ${days} days running.`,
    category: 'streak',
    order,
    isUnlocked: (ctx: AchievementContext) => ctx.gamification.streakLongest >= days,
  };
}
