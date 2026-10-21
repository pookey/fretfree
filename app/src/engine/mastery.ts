import { ENGINE_CONFIG } from './config';
import type { SpeedTargets } from './grading';
import type { CardRecord, GuideLevel, Skill, SkillStatus } from './model';

/** Design §3.4 (mastery and unlocking) and §3.5 (guide fading). */

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[mid] as number)
    : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

export interface MasteryInput {
  /** Total number of items the skill has (not only those with cards). */
  itemCount: number;
  cards: readonly CardRecord[];
  /** Response times of recent correct answers for this skill. */
  recentResponseMs: readonly number[];
  targets: SpeedTargets;
}

/**
 * A skill is mastered when ≥90% of its items have FSRS stability ≥ 7 days and
 * the recent median response time is within the target.
 */
export function isMastered(
  input: MasteryInput,
  cfg: { stabilityDays: number; itemShare: number } = ENGINE_CONFIG.mastery,
): boolean {
  if (input.itemCount === 0) return false;
  const stable = input.cards.filter((c) => c.fsrs.stability >= cfg.stabilityDays).length;
  if (stable / input.itemCount < cfg.itemShare) return false;
  const rt = median(input.recentResponseMs);
  return rt !== null && rt <= input.targets.targetMs;
}

/** A skill's prerequisites by the status each needs (design §3.4). */
export interface Gates {
  mastered: readonly string[];
  practising: readonly string[];
}

/**
 * `prerequisites` need mastering and `softPrerequisites` practising;
 * `softUnlock` softens every one of them.
 */
export function gatesOf(skill: Skill): Gates {
  const soft = skill.softPrerequisites ?? [];
  return skill.softUnlock === true
    ? { mastered: [], practising: [...skill.prerequisites, ...soft] }
    : { mastered: skill.prerequisites, practising: soft };
}

/** True when a prerequisite's `status` meets the `gate` it is listed under. */
export function meetsGate(gate: keyof Gates, status: SkillStatus | undefined): boolean {
  return status === 'mastered' || (gate === 'practising' && status === 'practising');
}

/** The prerequisites `skill` still waits for: hard ones first, then soft. */
export function unmetGates(skill: Skill, statuses: ReadonlyMap<string, SkillStatus>): string[] {
  const gates = gatesOf(skill);
  return (['mastered', 'practising'] as const).flatMap((gate) =>
    gates[gate].filter((p) => !meetsGate(gate, statuses.get(p))),
  );
}

/**
 * Unlocking is soft (design §3.4): locked skills can still be previewed; they
 * just don't feed new items into sessions automatically.
 */
export function deriveStatus(
  skill: Skill,
  statuses: ReadonlyMap<string, SkillStatus>,
  current: SkillStatus | undefined,
): SkillStatus {
  if (current === 'mastered' || current === 'practising') return current;
  return unmetGates(skill, statuses).length === 0 ? 'unlocked' : 'locked';
}

/** Skills that may feed new items: unlocked or practising, not mastered. */
export function isFrontier(status: SkillStatus): boolean {
  return status === 'unlocked' || status === 'practising';
}

/**
 * Guide fading: drop a level when the skill is accurate and on target, raise
 * one when accuracy collapses. Level 3 = full labels … 0 = bare neck.
 */
export function nextGuideLevel(
  level: GuideLevel,
  rollingAccuracy: number,
  medianResponseMs: number | null,
  targets: SpeedTargets,
  cfg: {
    maxLevel: number;
    fadeAtAccuracy: number;
    restoreBelowAccuracy: number;
  } = ENGINE_CONFIG.guides,
): GuideLevel {
  if (
    rollingAccuracy >= cfg.fadeAtAccuracy &&
    medianResponseMs !== null &&
    medianResponseMs <= targets.targetMs &&
    level > 0
  ) {
    return (level - 1) as GuideLevel;
  }
  if (rollingAccuracy < cfg.restoreBelowAccuracy && level < cfg.maxLevel) {
    return (level + 1) as GuideLevel;
  }
  return level;
}
