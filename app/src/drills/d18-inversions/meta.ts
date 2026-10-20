import { parseInversionItemId } from '../../engine/items/inversion';
import type { Item } from '../../engine/model';

/**
 * D18's eager half (design §6, §10): what the session planner needs before
 * the drill's logic has loaded. Keep it small; prompts and grading belong
 * in `logic.ts`.
 */

export const D18_ID = 'triad-inversions';

/**
 * Adaptive scope (design §3.3 step 4, research/02 rule 5): the roots a prompt
 * may use. `naturals` (0) roots on natural notes only; `all` (1) on any of
 * the 12 pitch classes, so the triad lands at every position.
 */
export type D18Scope = 'naturals' | 'all';

export const D18_SCOPES: readonly D18Scope[] = ['naturals', 'all'];
export const D18_SCOPE = { minLevel: 0, maxLevel: D18_SCOPES.length - 1 };

export function d18CanTest(item: Item): boolean {
  return parseInversionItemId(item.id) !== null;
}

/** The item's own ID: confusions pair one card with another (see `logic.ts`'s header). */
export function d18ConceptOf(item: Item): string | null {
  return d18CanTest(item) ? item.id : null;
}
