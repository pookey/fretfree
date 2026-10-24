import type { Item } from '../../engine/model';
import { parseFretStaffItemId } from '../../engine/items/fret-staff';
import { staffConcept } from '../../engine/items/staff';
import { ledgerLineCount, staffNote } from '../../theory';

/**
 * D24's eager half (design §6, §10): what the session planner needs before
 * the drill's logic has loaded. Keep it small; prompts and grading belong
 * in `logic.ts`.
 */

export const D24_ID = 'fret-to-staff';

/**
 * Adaptive scope (design §3.3 step 4, research/02 rule 5), narrowest first.
 *
 * - `position` (0): the staff takes taps over the position's own notes, a
 *   step beyond each end.
 * - `reading` (1): over R1's whole reach, three ledger lines each way, so
 *   places the position never plays are distractors too.
 */
export type D24Scope = 'position' | 'reading';

export const D24_SCOPES: readonly D24Scope[] = ['position', 'reading'];
export const D24_SCOPE = { minLevel: 0, maxLevel: D24_SCOPES.length - 1 };

/** R1's and R2's reach: notes within this many ledger lines. */
export const D24_MAX_LEDGERS = 3;

/** A natural `fret→staff` card within three ledger lines; null for anything else. */
export function d24Parse(item: Item): { note: string; position: string; place: number } | null {
  const ref = parseFretStaffItemId(item.id);
  if (!ref) return null;
  const n = staffNote(ref.note);
  if (n.alt !== 0 || ledgerLineCount(n.position) > D24_MAX_LEDGERS) return null;
  return { note: n.name, position: ref.position, place: n.position };
}

export function d24CanTest(item: Item): boolean {
  return d24Parse(item) !== null;
}

/**
 * The confusion-matrix concept: the staff place (`staff@2` is the 2nd line),
 * as R1's cards and D23 key theirs, so placing a note on the line for the
 * space beside it pairs those places wherever they were learned.
 */
export function d24ConceptOf(item: Item): string | null {
  const card = d24Parse(item);
  return card ? staffConcept(card.place) : null;
}
