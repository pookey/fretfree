import type { AchievementContext, AchievementDefinition } from '../types';

/**
 * The achievements newly unlocked by `ctx` (design §3.7 achievements). Pure.
 *
 * Returns, sorted by `order` (then `id`), every definition whose
 * `isUnlocked(ctx)` holds and whose id is not in `unlocked`. Already-unlocked
 * badges are never re-evaluated, so a badge, once earned, stays earned. The
 * caller persists them with `unlockAchievements`, which logs an
 * `achievement-unlocked` event for each.
 */
export function checkAchievements(
  ctx: AchievementContext,
  unlocked: ReadonlySet<string>,
  definitions: readonly AchievementDefinition[],
): AchievementDefinition[] {
  return definitions
    .filter((d) => !unlocked.has(d.id) && d.isUnlocked(ctx))
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}
