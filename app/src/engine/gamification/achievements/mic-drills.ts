import { ENGINE_CONFIG } from '../../config';
import type { ReviewLogRecord } from '../../model';
import { SKILLS } from '../../skills';
import type { AchievementContext, AchievementDefinition } from '../types';

/**
 * Shared by the mic badges and the mic quest. No default export, so the
 * registry skips this module.
 */

/**
 * The drills that grade a note played on a real guitar (`requiresMic` in
 * their plugins: D16, D17). The engine doesn't import drills, so the ids are
 * named here; a test keeps them in step with the drill registry.
 */
export const MIC_DRILLS: ReadonlySet<string> = new Set(['play-the-note', 'play-sequence']);

export function isMicDrill(drillType: string | undefined): boolean {
  return drillType !== undefined && MIC_DRILLS.has(drillType);
}

/** Skills that list a mic drill, so a session can serve one for their items. */
export const MIC_SKILLS: ReadonlySet<string> = new Set(
  SKILLS.filter((s) => s.drillTypes.some((d) => MIC_DRILLS.has(d))).map((s) => s.id),
);

/**
 * Whether the recent reviews show `drillType` answered well: at least
 * `minAnswers` unguided answers from it at `minAccuracy` or better. Guided
 * reps (the answer was shown) say nothing about recall, so they are left out.
 */
export function playsWell(
  reviews: readonly ReviewLogRecord[],
  drillType: string,
  cfg: { minAnswers: number; minAccuracy: number } = ENGINE_CONFIG.micBadges,
): boolean {
  const graded = reviews.filter((r) => r.drillType === drillType && !r.hintUsed);
  if (graded.length < cfg.minAnswers) return false;
  return graded.filter((r) => r.correct).length / graded.length >= cfg.minAccuracy;
}

/** A badge earned by answering a mic drill well (design §3.7: competence, not volume). */
export function micAchievement(
  def: Omit<AchievementDefinition, 'category' | 'isUnlocked'> & { drillType: string },
): AchievementDefinition {
  const { drillType, ...rest } = def;
  return {
    ...rest,
    category: 'mastery',
    isUnlocked: (ctx: AchievementContext) => playsWell(ctx.recentReviews, drillType),
  };
}

/** "9 times in 10", from the badges' accuracy bar. */
export const MIC_ACCURACY_COPY = `${Math.round(ENGINE_CONFIG.micBadges.minAccuracy * 10)} times in 10`;
