import type { AnswerXpInput } from './types';

/**
 * XP for one graded answer (design §3.7 XP). Pure.
 *
 * Contract for M1-08, which replaces this stub:
 * - Due reviews and new items earn more than `not-due` stable cards.
 * - A correct, fluent answer (`Rating.Easy`) earns a small bonus.
 * - A wrong answer still earns base XP for attempting.
 * - XP decays with `answeredToday`, so re-drilling a card the same day pays less.
 * - Grinding a stable card can never out-earn doing due reviews.
 * - Weights live in `ENGINE_CONFIG.gamification`.
 *
 * Returns a whole, non-negative number of XP.
 */
export function xpForAnswer(_input: AnswerXpInput): number {
  return 0;
}
