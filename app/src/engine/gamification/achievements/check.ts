import type { AchievementContext, AchievementDefinition } from '../types';

/**
 * The achievements newly unlocked by `ctx` (design §3.7 achievements). Pure.
 *
 * Contract for M1-13, which replaces this stub: return, in `order`, every
 * definition whose `isUnlocked(ctx)` holds and whose id is not in `unlocked`.
 * The caller persists them with `unlockAchievements`, which logs an
 * `achievement-unlocked` event for each.
 */
export function checkAchievements(
  _ctx: AchievementContext,
  _unlocked: ReadonlySet<string>,
  _definitions: readonly AchievementDefinition[],
): AchievementDefinition[] {
  return [];
}
