import { ENGINE_CONFIG } from '../../config';
import { median } from '../../mastery';
import type { AchievementContext, AchievementDefinition } from '../types';

const { medianMs, minAnswers, minAccuracy } = ENGINE_CONFIG.gamification.achievements.speedDemon;

/**
 * Fluency, not volume: the median response time of correct answers among the
 * recent reviews is under 1.2 s. Guided reps (the note was shown) don't count,
 * and the window needs enough unguided answers at high accuracy that fast
 * guessing can't earn it.
 */
export function isSpeedDemon(
  ctx: AchievementContext,
  cfg: { medianMs: number; minAnswers: number; minAccuracy: number } = {
    medianMs,
    minAnswers,
    minAccuracy,
  },
): boolean {
  const graded = ctx.recentReviews.filter((r) => !r.hintUsed);
  if (graded.length < cfg.minAnswers) return false;
  const correct = graded.filter((r) => r.correct);
  if (correct.length / graded.length < cfg.minAccuracy) return false;
  const rt = median(correct.map((r) => r.responseMs));
  return rt !== null && rt < cfg.medianMs;
}

const speedDemon: AchievementDefinition = {
  id: 'speed-demon',
  title: 'Speed demon',
  description: 'Your typical correct answer now takes under 1.2 seconds.',
  category: 'speed',
  order: 100,
  isUnlocked: (ctx) => isSpeedDemon(ctx),
};

export default speedDemon;
