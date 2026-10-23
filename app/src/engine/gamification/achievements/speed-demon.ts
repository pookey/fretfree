import { ENGINE_CONFIG } from '../../config';
import { median } from '../../mastery';
import { isSpeedEvidence } from '../../speed';
import type { AchievementContext, AchievementDefinition } from '../types';

const { marginMs, minAnswers, minAccuracy } = ENGINE_CONFIG.gamification.achievements.speedDemon;

export interface SpeedDemonConfig {
  marginMs: number;
  minAnswers: number;
  minAccuracy: number;
  /** The tap time assumed before calibration, as grading assumes it. */
  defaultBaselineMs: number;
}

/**
 * Fluency, not volume, and recall, not hand speed: the median response time
 * of correct answers among the recent reviews is under the learner's own tap
 * time plus `marginMs`. Motor speed differs between people, so a learner with
 * slower hands earns it for recall as quick as anyone's. Guided reps (the
 * note was shown) don't count, and the window needs enough unguided answers
 * at high accuracy that fast guessing can't earn it.
 */
export function isSpeedDemon(
  ctx: AchievementContext,
  cfg: SpeedDemonConfig = {
    marginMs,
    minAnswers,
    minAccuracy,
    defaultBaselineMs: ENGINE_CONFIG.grading.defaultBaselineMs,
  },
): boolean {
  // A timing drill's responseMs is its timing error, not answer speed.
  const graded = ctx.recentReviews.filter((r) => !r.hintUsed && isSpeedEvidence(r.drillType));
  if (graded.length < cfg.minAnswers) return false;
  const correct = graded.filter((r) => r.correct);
  if (correct.length / graded.length < cfg.minAccuracy) return false;
  const rt = median(correct.map((r) => r.responseMs));
  const baseline = ctx.latencyBaselineMs ?? cfg.defaultBaselineMs;
  return rt !== null && rt < baseline + cfg.marginMs;
}

/** "half a second", "1.5 seconds": the margin as the badge says it. */
export function marginCopy(ms: number): string {
  if (ms === 500) return 'half a second';
  const s = ms / 1000;
  return `${s} ${s === 1 ? 'second' : 'seconds'}`;
}

const speedDemon: AchievementDefinition = {
  id: 'speed-demon',
  title: 'Speed demon',
  description: `Your typical correct answer now comes within ${marginCopy(marginMs)} of your own tap time: you recall as fast as you can tap.`,
  category: 'speed',
  order: 100,
  isUnlocked: (ctx) => isSpeedDemon(ctx),
};

export default speedDemon;
