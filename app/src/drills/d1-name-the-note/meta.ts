import { parseNoteItemId, type Item } from '../../engine/model';
import { noteAt } from '../../theory';
import type { DrillContext } from '../types';

/**
 * D1's eager half (design §6, §10): what the session planner needs before
 * the drill's logic has loaded. Keep it small; prompts and grading belong
 * in `logic.ts`.
 */

export const D1_ID = 'name-the-note';

/**
 * Scope levels: 0 = the 7 natural-note buttons (when the target is natural);
 * 1 = all 12 chromatic buttons. Accidental targets always get 12 buttons.
 */
export const D1_SCOPE = { minLevel: 0, maxLevel: 1 };

export function d1CanTest(item: Item): boolean {
  return parseNoteItemId(item.id) !== null;
}

export function d1ConceptOf(
  item: Item,
  ctx: Pick<DrillContext, 'tuning' | 'accidentalPref'>,
): string | null {
  const pos = parseNoteItemId(item.id);
  return pos ? noteAt(pos, ctx.tuning, ctx.accidentalPref).pc : null;
}
