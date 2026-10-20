import { parseFindItemId, parseOctaveItemId, type Item } from '../../engine/model';
import { chromaOf, chromaToPc } from '../../theory';
import { d4ConceptOf } from '../d4-octave-finder/meta';
import type { DrillContext } from '../types';

/**
 * D16's eager half (design §6, §10): what the session planner needs before
 * the drill's logic has loaded. Keep it small; prompts and grading belong
 * in `logic.ts`.
 */

export const D16_ID = 'play-the-note';

export type D16Mode = 'pitch-class' | 'region' | 'any-position';

/** Adaptive scope for find items (design §3.3 step 4), most forgiving first. */
export const D16_SCOPES = ['pitch-class', 'region'] as const satisfies readonly D16Mode[];
export const D16_SCOPE = { minLevel: 0, maxLevel: D16_SCOPES.length - 1 };

export function d16CanTest(item: Item): boolean {
  return parseFindItemId(item.id) !== null || parseOctaveItemId(item.id) !== null;
}

export function d16ConceptOf(
  item: Item,
  ctx: Pick<DrillContext, 'tuning' | 'accidentalPref'>,
): string | null {
  const find = parseFindItemId(item.id);
  if (find) return chromaToPc(chromaOf(find.pc), ctx.accidentalPref);
  // Keyed as D4 keys it, so both drills share the shape's confusions.
  return d4ConceptOf(item, ctx);
}
