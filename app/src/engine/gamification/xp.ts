import { Rating } from 'ts-fsrs';
import { ENGINE_CONFIG } from '../config';
import type { AnswerXpInput, CardKind } from './types';

/** The weights `xpForAnswer` uses; `ENGINE_CONFIG.gamification.xp` by default. */
export interface XpConfig {
  attempt: number;
  correctBonus: number;
  fluentBonus: number;
  kindWeight: Readonly<Record<CardKind, number>>;
  stableHalfLifeDays: number;
  repeatDecay: number;
}

/**
 * XP for one graded answer (design §3.7 XP). Pure.
 *
 * - Every answer earns `attempt` XP, so a wrong answer still pays for trying.
 *   A correct answer adds `correctBonus`; a fluent one (`Rating.Easy`) adds a
 *   small `fluentBonus` on top.
 * - The sum is weighted by learning value: due reviews and new items count in
 *   full, stretch items slightly less, and a `not-due` card less again, falling
 *   further as its stability grows (halving at `stableHalfLifeDays`).
 * - Each earlier answer to the same item today multiplies XP by `repeatDecay`.
 *
 * With the default weights a not-due card earns at most 5 XP, below the 6 XP
 * of even a wrong first answer to a due review, so grinding stable cards never
 * out-earns doing due reviews (research/02 rule 15; tested in `xp.test.ts`).
 *
 * Returns a whole, non-negative number of XP.
 */
export function xpForAnswer(
  input: AnswerXpInput,
  cfg: XpConfig = ENGINE_CONFIG.gamification.xp,
): number {
  let raw = cfg.attempt;
  if (input.correct) {
    raw += cfg.correctBonus;
    if (input.rating === Rating.Easy) raw += cfg.fluentBonus;
  }
  const xp = raw * learningWeight(input, cfg) * repeatFactor(input.answeredToday, cfg);
  return Math.max(0, Math.round(xp));
}

function learningWeight(input: AnswerXpInput, cfg: XpConfig): number {
  const weight = cfg.kindWeight[input.kind];
  if (input.kind !== 'not-due') return weight;
  const stability = Math.max(0, input.stabilityDays);
  return (weight * cfg.stableHalfLifeDays) / (cfg.stableHalfLifeDays + stability);
}

function repeatFactor(answeredToday: number, cfg: XpConfig): number {
  return cfg.repeatDecay ** Math.max(0, Math.floor(answeredToday));
}
