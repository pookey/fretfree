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
 * Adaptive scope (design §3.3 step 4, research/02 rule 5), easiest first.
 * Both play the open string, then the note, and the learner taps the note
 * on that string:
 *
 * - `named` (0): the prompt names the note too, so the sound is paired with
 *   a name and a place the learner can already find (rule 10).
 * - `by-ear` (1): the name is held back until feedback. The learner hears
 *   how far above the open string the note is and finds the fret
 *   (rule 13: hear it, find it).
 */
export type D15Scope = 'named' | 'by-ear';

export const D15_SCOPES: readonly D15Scope[] = ['named', 'by-ear'];
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
