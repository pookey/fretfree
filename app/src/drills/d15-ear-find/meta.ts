import type { Item } from '../../engine/model';
import { parseFindItemId } from '../../engine/items/find';
import { chromaOf, chromaToPc } from '../../theory';
import type { DrillContext } from '../types';

/**
 * D15's eager half (design §6, §10): what the session planner needs before
 * the drill's logic has loaded. Keep it small; prompts and grading belong
 * in `logic.ts`.
 */

export const D15_ID = 'hear-it-find-it';

/**
 * Adaptive scope (design §3.3 step 4, research/02 rule 5), narrowest first,
 * as D2's:
 *
 * - `string` (0): only the named string is live; the other strings are dimmed.
 * - `region` (1): every string is live within frets 0–12, so the learner must
 *   also keep to the named string. The same note on another string is wrong.
 *
 * Whether the prompt names the note is a guide, not scope: it fades with the
 * skill's guide level (rule 9), so the learner moves from hearing a named
 * note to finding it by ear alone (rule 13).
 */
export type D15Scope = 'string' | 'region';

export const D15_SCOPES: readonly D15Scope[] = ['string', 'region'];
export const D15_SCOPE = { minLevel: 0, maxLevel: D15_SCOPES.length - 1 };

export function d15CanTest(item: Item): boolean {
  return parseFindItemId(item.id) !== null;
}

/** Keyed by pitch class, as D2 keys the same cards, so the drills share confusions. */
export function d15ConceptOf(
  item: Item,
  ctx: Pick<DrillContext, 'tuning' | 'accidentalPref'>,
): string | null {
  const ref = parseFindItemId(item.id);
  return ref ? chromaToPc(chromaOf(ref.pc), ctx.accidentalPref) : null;
}
