import type { Item, ItemRefs } from '../../engine/model';
import { parseFormItemId } from '../../engine/items/form';

/**
 * The form-reading drill's eager half (design §6, §10): what the session
 * planner needs before the drill's logic has loaded. Prompts and grading
 * belong in `logic.ts`.
 */

export const FORM_READING_ID = 'form-reading';

/**
 * Scope levels (research/02 rule 5): at 0 a pickup card asks for bar 1 or 2
 * and a road map's "which bar next?" offers the bars a reader turns to; at 1
 * a pickup card counts on to bar 3, and every bar is a choice.
 */
export const FORM_READING_SCOPE = { minLevel: 0, maxLevel: 1 };

export type FormReadingRef = ItemRefs['form'];

export function formReadingParse(item: Item): FormReadingRef | null {
  return parseFormItemId(item.id);
}

export function formReadingCanTest(item: Item): boolean {
  return formReadingParse(item) !== null;
}

/**
 * The confusion-matrix concept: a pickup's length in its meter
 * (`pickup:4/4:1`), or the road map (`form:repeat-inner`). Going back to
 * bar 1 past a begin repeat confuses `form:repeat-inner` with
 * `form:repeat-from-start`.
 */
export function formReadingConcept(ref: FormReadingRef): string {
  return ref.kind === 'pickup' ? `pickup:${ref.meter}:${ref.beats}` : `form:${ref.shape}`;
}

export function formReadingConceptOf(item: Item): string | null {
  const ref = formReadingParse(item);
  return ref ? formReadingConcept(ref) : null;
}
