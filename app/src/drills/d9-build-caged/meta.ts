import { parseCagedItemId, type Item } from '../../engine/model';

/**
 * D9's eager half (design §6, §10): what the session planner needs before
 * the drill's logic has loaded. Keep it small; prompts and grading belong
 * in `logic.ts`.
 */

export const D9_ID = 'build-caged';

/**
 * Adaptive scope (design §3.3 step 4, research/02 rule 5): the roots a prompt
 * may use. `naturals` (0) roots on natural notes only; `all` (1) on any of
 * the 12 pitch classes, so the shape lands at every position.
 */
export type D9Scope = 'naturals' | 'all';

export const D9_SCOPES: readonly D9Scope[] = ['naturals', 'all'];
export const D9_SCOPE = { minLevel: 0, maxLevel: D9_SCOPES.length - 1 };

export function d9CanTest(item: Item): boolean {
  return parseCagedItemId(item.id) !== null;
}

export function d9ConceptOf(item: Item): string | null {
  const ref = parseCagedItemId(item.id);
  return ref ? `caged:${ref.shape}` : null;
}
