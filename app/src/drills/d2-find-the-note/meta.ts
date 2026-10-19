import { parseFindItemId, type Item } from '../../engine/model';
import { chromaOf, chromaToPc } from '../../theory';
import type { DrillContext } from '../types';

/**
 * D2's eager half (design §6, §10): what the session planner needs before
 * the drill's logic has loaded. Keep it small; prompts and grading belong
 * in `logic.ts`.
 */

export const D2_ID = 'find-the-note';

/**
 * Adaptive scope (design §3.3 step 4, research/02 rule 5), narrowest first:
 *
 * - `string` (0): only the named string is live; the other strings are dimmed.
 * - `region` (1): every string is live within frets 0–12, so the learner must
 *   also pick out the right string. A tap on the wrong string is wrong.
 * - `neck` (2): the whole 15-fret neck is live, and the octave repeats above
 *   fret 12 also count.
 */
export type D2Scope = 'string' | 'region' | 'neck';

export const D2_SCOPES: readonly D2Scope[] = ['string', 'region', 'neck'];
export const D2_SCOPE = { minLevel: 0, maxLevel: D2_SCOPES.length - 1 };

export function d2CanTest(item: Item): boolean {
  return parseFindItemId(item.id) !== null;
}

export function d2ConceptOf(
  item: Item,
  ctx: Pick<DrillContext, 'tuning' | 'accidentalPref'>,
): string | null {
  const ref = parseFindItemId(item.id);
  return ref ? chromaToPc(chromaOf(ref.pc), ctx.accidentalPref) : null;
}
