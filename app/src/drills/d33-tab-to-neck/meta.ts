import type { Item } from '../../engine/model';
import { parseTabItemId } from '../../engine/items/tab';

/**
 * D33's eager half (design §6, §10): what the session planner needs before
 * the drill's logic has loaded. Keep it small; prompts and grading belong
 * in `logic.ts`.
 */

export const D33_ID = 'tab-to-neck';

/**
 * Adaptive scope (design §3.3 step 4, research/02 rule 5), narrowest first.
 * Every string is live at every level: dimming the others would answer the
 * line → string half of the item (rule 4).
 *
 * - `region` (0): frets 0–12 are live.
 * - `neck` (1): the whole 15-fret neck is live, so frets past 12 are
 *   distractors too.
 */
export type D33Scope = 'region' | 'neck';

export const D33_SCOPES: readonly D33Scope[] = ['region', 'neck'];
export const D33_SCOPE = { minLevel: 0, maxLevel: D33_SCOPES.length - 1 };

export function d33CanTest(item: Item): boolean {
  return parseTabItemId(item.id) !== null;
}

/**
 * The confusion-matrix key: the tab line. Misreading the line is the error
 * tab drills pair items on (neighbouring lines, and the two E lines read
 * upside down: `engine/confusions.ts`).
 */
export function d33LineConcept(string: number): string {
  return `tab:line${string}`;
}

export function d33ConceptOf(item: Item): string | null {
  const pos = parseTabItemId(item.id);
  return pos ? d33LineConcept(pos.string) : null;
}
