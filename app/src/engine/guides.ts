import { ENGINE_CONFIG } from './config';
import type { AnswerOutcome, SpeedTargets } from './grading';
import type { GuideLevel } from './model';

/**
 * Guide fading within a session (design §3.5, research/02 rule 9). The
 * across-session step is `nextGuideLevel` in `mastery.ts`; this one reacts
 * answer by answer, so guides fade as soon as a learner is fluent and come
 * back as soon as they struggle.
 */

export interface GuideFadingConfig {
  maxLevel: number;
  fadeAfterFluent: number;
  restoreAfterErrors: number;
}

export interface GuideStreak {
  /** Consecutive fluent answers: correct and at or under the speed target. */
  fluent: number;
  /** Consecutive wrong answers. */
  errors: number;
}

export const EMPTY_STREAK: GuideStreak = { fluent: 0, errors: 0 };

export interface GuideStep {
  level: GuideLevel;
  streak: GuideStreak;
}

/** A correct answer at or under the speed target (graded Good or Easy). */
export function isFluent(outcome: AnswerOutcome, targets: SpeedTargets): boolean {
  return outcome.correct && outcome.responseMs <= targets.targetMs;
}

/**
 * One answer's effect on a skill's guide level. Worked examples (hinted reps)
 * are not evidence of recall and leave everything as it was. A level change
 * starts a fresh streak.
 */
export function stepGuideLevel(
  level: GuideLevel,
  streak: GuideStreak,
  outcome: AnswerOutcome,
  targets: SpeedTargets,
  cfg: GuideFadingConfig = ENGINE_CONFIG.guides,
): GuideStep {
  if (outcome.hintUsed) return { level, streak };
  if (!outcome.correct) {
    const errors = streak.errors + 1;
    if (errors >= cfg.restoreAfterErrors && level < cfg.maxLevel) {
      return { level: (level + 1) as GuideLevel, streak: EMPTY_STREAK };
    }
    return { level, streak: { fluent: 0, errors } };
  }
  if (!isFluent(outcome, targets)) return { level, streak: EMPTY_STREAK };
  const fluent = streak.fluent + 1;
  if (fluent >= cfg.fadeAfterFluent && level > 0) {
    return { level: (level - 1) as GuideLevel, streak: EMPTY_STREAK };
  }
  return { level, streak: { fluent, errors: 0 } };
}

/** Per-skill streaks for one session, and the level each skill started it at. */
export class SessionGuides {
  private readonly streaks = new Map<string, GuideStreak>();
  private readonly startLevels = new Map<string, GuideLevel>();

  constructor(
    private readonly targets: SpeedTargets,
    private readonly cfg: GuideFadingConfig = ENGINE_CONFIG.guides,
  ) {}

  /** Record an answer for a skill currently at `level`; returns its new level. */
  record(skillId: string, level: GuideLevel, outcome: AnswerOutcome): GuideLevel {
    if (!this.startLevels.has(skillId)) this.startLevels.set(skillId, level);
    const step = stepGuideLevel(
      level,
      this.streaks.get(skillId) ?? EMPTY_STREAK,
      outcome,
      this.targets,
      this.cfg,
    );
    this.streaks.set(skillId, step.streak);
    return step.level;
  }

  /** The level a skill had before its first answer this session (`fallback` if unanswered). */
  startLevel(skillId: string, fallback: GuideLevel): GuideLevel {
    return this.startLevels.get(skillId) ?? fallback;
  }
}
