import { ENGINE_CONFIG } from '../engine/config';
import { checkAchievements } from '../engine/gamification/achievements/check';
import type { AchievementContext, AchievementDefinition } from '../engine/gamification/types';
import type { FretworkDB } from './db';
import { getUnlockedAchievements, unlockAchievements } from './gamification-repo';
import { getGamification, getSettings, getSkillStates } from './repository';

/**
 * Glue between the stored data and the pure `checkAchievements` (design §3.7
 * achievements): load what the predicates may look at, check, and persist
 * anything newly earned.
 */

/** The latest `limit` reviews across every skill, newest last. */
export async function latestReviews(db: FretworkDB, limit: number) {
  return (await db.reviewLogs.orderBy('at').reverse().limit(limit).toArray()).reverse();
}

/** Everything an achievement predicate may look at, read from the database. */
export async function loadAchievementContext(
  db: FretworkDB,
  recentLimit: number = ENGINE_CONFIG.gamification.achievements.recentReviews,
): Promise<AchievementContext> {
  const [skillStates, gamification, recentReviews, settings] = await Promise.all([
    getSkillStates(db),
    getGamification(db),
    latestReviews(db, recentLimit),
    getSettings(db),
  ]);
  return {
    skillStates,
    gamification,
    recentReviews,
    latencyBaselineMs: settings.latencyBaselineMs,
  };
}

/**
 * Unlock and persist every badge `ctx` now earns. Returns the definitions
 * that were actually new, in display order: safe to call concurrently or
 * repeatedly, since `unlockAchievements` skips ids already stored.
 */
export async function syncAchievements(
  db: FretworkDB,
  definitions: readonly AchievementDefinition[],
  at: Date,
  ctx?: AchievementContext,
): Promise<AchievementDefinition[]> {
  const context = ctx ?? (await loadAchievementContext(db));
  const unlocked = new Set((await getUnlockedAchievements(db)).keys());
  const earned = checkAchievements(context, unlocked, definitions);
  if (earned.length === 0) return [];
  const fresh = new Set(
    await unlockAchievements(
      db,
      earned.map((d) => d.id),
      at,
    ),
  );
  return earned.filter((d) => fresh.has(d.id));
}
