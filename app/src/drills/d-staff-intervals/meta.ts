import type { Item, ItemRefs } from '../../engine/model';
import { parseStaffIntervalItemId, staffIntervalConcept } from '../../engine/items/staff-interval';

/**
 * The staff-interval drill's eager half (design §6, §10): what the session
 * planner needs before the logic has loaded. Prompts and grading belong in
 * `logic.ts`.
 */

export const STAFF_INTERVAL_ID = 'staff-interval';

/**
 * Adaptive scope (research/02 rule 5):
 *
 * | Level | Reading cards | Placing cards |
 * |---|---|---|
 * | 0 | the pair alone, on the staff | taps on the staff |
 * | 1 | the pair inside a short phrase (read ahead), on the staff | as 0 |
 * | 2 | the phrase, out to three ledger lines | taps out to three ledger lines |
 */
export const STAFF_INTERVAL_SCOPE = { minLevel: 0, maxLevel: 2 };

export type StaffIntervalCard = Omit<ItemRefs['staff-interval'], 'kind'>;

/** A treble 8vb staff interval card; null for anything else. */
export function staffIntervalParse(item: Item): StaffIntervalCard | null {
  const ref = parseStaffIntervalItemId(item.id);
  return ref && ref.clef === 'treble8vb' ? ref : null;
}

export function staffIntervalCanTest(item: Item): boolean {
  return staffIntervalParse(item) !== null;
}

/** The confusion-matrix concept: the interval's size (`staff-interval:3`), either way up. */
export function staffIntervalConceptOf(item: Item): string | null {
  const card = staffIntervalParse(item);
  return card ? staffIntervalConcept(card.steps) : null;
}
