import type { Item } from '../../engine/model';
import { parseStaffItemId, staffConcept, type StaffDirection } from '../../engine/items/staff';
import { staffNote } from '../../theory';

/**
 * D22's eager half (design §6, §10): what the session planner needs before
 * the drill's logic has loaded. Keep it small; prompts and grading belong
 * in `logic.ts`.
 */

export const D22_ID = 'staff-name';

/**
 * Adaptive scope (research/02 rule 5). Reading cards always offer A–G.
 * Placing cards take taps on the named note's part of the staff (below it,
 * on it or above it) and a place either side at 0, and anywhere within three
 * ledger lines at 1.
 */
export const D22_SCOPE = { minLevel: 0, maxLevel: 1 };

/** R1's reach: three ledger lines below the staff to three above, with the spaces beyond. */
export const D22_LOWEST = -7;
export const D22_HIGHEST = 15;

export interface D22Card {
  note: string;
  direction: StaffDirection;
  /** Staff position: 0 is the bottom line, odd numbers are spaces. */
  position: number;
}

/** A natural note on the treble 8vb staff within R1's reach; null for anything else. */
export function d22Parse(item: Item): D22Card | null {
  const ref = parseStaffItemId(item.id);
  if (!ref || ref.clef !== 'treble8vb') return null;
  const n = staffNote(ref.note, ref.clef);
  if (n.alt !== 0 || n.position < D22_LOWEST || n.position > D22_HIGHEST) return null;
  return { note: n.name, direction: ref.direction, position: n.position };
}

export function d22CanTest(item: Item): boolean {
  return d22Parse(item) !== null;
}

/**
 * The confusion-matrix concept: the staff place, so the session builder's
 * seeds pair each line with the spaces beside it (`engine/confusions.ts`).
 */
export function d22ConceptOf(item: Item): string | null {
  const card = d22Parse(item);
  return card ? staffConcept(card.position) : null;
}
