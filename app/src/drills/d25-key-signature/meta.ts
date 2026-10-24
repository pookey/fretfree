import { keyApplyItemId, parseKeyApplyItemId } from '../../engine/items/key-apply';
import type { Item } from '../../engine/model';

/**
 * D25's eager half (design §6, §10): what the session planner needs before
 * the drill's logic has loaded. Keep it small; prompts and grading belong
 * in `logic.ts`.
 */

export const D25_ID = 'key-signature-apply';

/**
 * Scope levels (research/02 rule 5): where the note may sit. 0 keeps it on
 * the staff, 1 adds a ledger line each side, 2 reaches R1's ±3 ledger lines
 * (low E up to F). The buttons stay the letter's three spellings, so they
 * never hint at the answer.
 */
export const D25_SCOPE = { minLevel: 0, maxLevel: 2 };

/** A key-apply item's letter and signature; null for items D25 doesn't ask. */
export function d25Parse(item: Item): { letter: string; alteration: number } | null {
  return parseKeyApplyItemId(item.id);
}

export function d25CanTest(item: Item): boolean {
  return d25Parse(item) !== null;
}

/**
 * The confusion-matrix concept: the card itself, letter and signature. A
 * wrong spelling is keyed by the nearest signature that would make it right
 * (`logic.ts`), so F♮ under 1 sharp pairs `F@1#` with `F@0`.
 */
export function d25Concept(letter: string, alteration: number): string {
  return keyApplyItemId(letter, alteration);
}

export function d25ConceptOf(item: Item): string | null {
  const ref = d25Parse(item);
  return ref ? d25Concept(ref.letter, ref.alteration) : null;
}
