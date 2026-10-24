import type { Item } from '../../engine/model';
import { parseStaffFretItemId } from '../../engine/items/staff-fret';
import { staffPosition } from '../../theory';

/**
 * D23's eager half (design §6, §10): what the session planner needs before
 * the drill's logic has loaded. Keep it small; prompts and grading belong
 * in `logic.ts`.
 */

export const D23_ID = 'staff-to-fret';

/**
 * Adaptive scope (design §3.3 step 4, research/02 rule 5), narrowest first.
 * The position's region is always shown and the rest of the neck dimmed: the
 * position is part of the question, not a hint.
 *
 * - `position` (0): only the region takes taps.
 * - `neck` (1): the whole 15-fret neck takes taps, so the same pitch played
 *   out of position (open G for G3 in 5th position) is a distractor too.
 */
export type D23Scope = 'position' | 'neck';

export const D23_SCOPES: readonly D23Scope[] = ['position', 'neck'];
export const D23_SCOPE = { minLevel: 0, maxLevel: D23_SCOPES.length - 1 };

export function d23CanTest(item: Item): boolean {
  return parseStaffFretItemId(item.id) !== null;
}

/**
 * The confusion-matrix key: the staff place (`staff@2` is the 2nd line), as
 * R1's staff cards key theirs. Misreading a line as the space beside it is
 * the error a reading drill pairs items on, and a place, not a position, so
 * a misread learned in one position pairs the place in every position.
 */
export function d23StaffConcept(place: number): string {
  return `staff@${place}`;
}

export function d23ConceptOf(item: Item): string | null {
  const ref = parseStaffFretItemId(item.id);
  return ref ? d23StaffConcept(staffPosition(ref.note)) : null;
}
