import { Rating, State } from 'ts-fsrs';
import { ENGINE_CONFIG } from './config';
import type { CardRecord, ReviewLogRecord } from './model';

/**
 * Progress before mastery (design §3.4, §3.7; research/02 rules 11 and 15).
 * An item is *stable* once its FSRS stability reaches `mastery.stabilityDays`,
 * which same-day practice can't reach, so a first session alone shows no
 * stable items. *Learning* is the visible step before that: the item has a
 * card and its most recent review was correct (not Again). A miss takes it
 * out again, so the count is honest rather than monotonic. Display only:
 * mastery and unlocking still depend on stable items and speed (rule 7).
 */

/** The fields of a review log that progress reads. */
export type ReviewOutcome = Pick<ReviewLogRecord, 'itemId' | 'rating' | 'at'>;

/**
 * Each item's latest review: true when it was correct (not Again). Logs may
 * come in any order; on a tie in time the later log in the list wins, so
 * logs in insertion order resolve to the last one written.
 */
export function latestOutcomes(logs: Iterable<ReviewOutcome>): Map<string, boolean> {
  const latest = new Map<string, { at: number; correct: boolean }>();
  for (const log of logs) {
    const at = log.at.getTime();
    const prev = latest.get(log.itemId);
    if (prev && prev.at > at) continue;
    latest.set(log.itemId, { at, correct: log.rating !== Rating.Again });
  }
  return new Map([...latest].map(([id, l]) => [id, l.correct]));
}

export function isStable(
  card: CardRecord,
  stabilityDays: number = ENGINE_CONFIG.mastery.stabilityDays,
): boolean {
  return card.fsrs.stability >= stabilityDays;
}

/**
 * Whether a card's item is learning. Without a review log, a card that has
 * left the New state counts: a placement test seeds known items as reviewed
 * cards, and its judgement stands until a real review says otherwise.
 */
export function isLearning(card: CardRecord, latestCorrect: boolean | undefined): boolean {
  return latestCorrect ?? card.fsrs.state !== State.New;
}

export interface SkillProgress {
  /**
   * Items learning or stable. A stable item counts as learning too, so the
   * stable share never exceeds the learning share.
   */
  learning: number;
  stable: number;
}

/** Learning and stable item counts per skill ID. */
export function progressBySkill(
  cards: readonly CardRecord[],
  outcomes: ReadonlyMap<string, boolean>,
  stabilityDays: number = ENGINE_CONFIG.mastery.stabilityDays,
): Map<string, SkillProgress> {
  const out = new Map<string, SkillProgress>();
  for (const card of cards) {
    const stable = isStable(card, stabilityDays);
    const learning = stable || isLearning(card, outcomes.get(card.itemId));
    if (!learning) continue;
    const p = out.get(card.skillId) ?? { learning: 0, stable: 0 };
    p.learning += 1;
    if (stable) p.stable += 1;
    out.set(card.skillId, p);
  }
  return out;
}
