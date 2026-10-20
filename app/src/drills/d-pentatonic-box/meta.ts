import { parseScalePositionItemId } from '../../engine/items/scale-position';
import { parsePentaItemId, type Item } from '../../engine/model';

/**
 * The pentatonic box drill's eager half (design §6, §10): what the session
 * planner needs before the drill's logic has loaded. Keep it small; prompts
 * and grading belong in `logic.ts` (boxes, C7) and `scale.ts` (major-scale
 * positions, I7).
 */

export const DPB_ID = 'pentatonic-box';

/**
 * Adaptive scope (design §3.3 step 4, research/02 rule 5): the roots a prompt
 * may use. `naturals` (0) roots on natural notes only; `all` (1) on any of
 * the 12 pitch classes, so the box or position lands at every place on the neck.
 */
export type DpbScope = 'naturals' | 'all';

export const DPB_SCOPES: readonly DpbScope[] = ['naturals', 'all'];
export const DPB_SCOPE = { minLevel: 0, maxLevel: DPB_SCOPES.length - 1 };

/** An I7 card: a major-scale position, or a run through one from a degree. */
export function dpsCanTest(item: Item): boolean {
  return parseScalePositionItemId(item.id) !== null;
}

export function dpbCanTest(item: Item): boolean {
  return parsePentaItemId(item.id) !== null || dpsCanTest(item);
}

/** The item's own ID: confusions pair one card with another (see `logic.ts`'s header). */
export function dpbConceptOf(item: Item): string | null {
  return dpbCanTest(item) ? item.id : null;
}
