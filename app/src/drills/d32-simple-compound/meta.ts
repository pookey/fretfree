import type { Item } from '../../engine/model';
import { parseMeterItemId, type MeterFact } from '../../engine/items/meter';

/**
 * D32's eager half (design §6, §10): what the session planner needs before
 * the drill's logic has loaded. Keep it small; prompts and grading belong
 * in `logic.ts`.
 */

export const D32_ID = 'simple-compound';

/**
 * Scope levels (research/02 rule 5, distractors): at 0 a card offers the
 * answers of its own family of meters, at 1 those of every meter D32 asks.
 */
export const D32_SCOPE = { minLevel: 0, maxLevel: 1 };

/** The meters D32 asks about, in button order: simple, cut time, compound. */
export const D32_METERS: readonly string[] = ['2/4', '3/4', '4/4', '2/2', '6/8', '9/8', '12/8'];

/** A meter card's time signature and what it asks; null for items D32 doesn't ask. */
export function d32Parse(item: Item): { meter: string; fact: MeterFact } | null {
  const ref = parseMeterItemId(item.id);
  return ref && D32_METERS.includes(ref.meter) ? ref : null;
}

export function d32CanTest(item: Item): boolean {
  return d32Parse(item) !== null;
}

/**
 * The confusion-matrix concept: the meter, so every card about 6/8 shares
 * `meter:6/8`, and the session builder's seed pairs 6/8 with 3/4.
 */
export function d32Concept(meter: string): string {
  return `meter:${meter}`;
}

export function d32ConceptOf(item: Item): string | null {
  const ref = d32Parse(item);
  return ref ? d32Concept(ref.meter) : null;
}
