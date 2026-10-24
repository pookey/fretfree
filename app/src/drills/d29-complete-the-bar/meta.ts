import type { Item } from '../../engine/model';
import { parseMeterItemId } from '../../engine/items/meter';

/**
 * D29's eager half (design §6, §10): what the session planner needs before
 * the drill's logic has loaded. Keep it small; prompts and grading belong
 * in `logic.ts`.
 */

export const D29_ID = 'complete-the-bar';

/**
 * Scope levels (research/02 rule 5): at 0 the learner fills the last two
 * beats of a bar from four note values, at 1 all but its first beat from
 * seven, at 2 an empty bar.
 */
export const D29_SCOPE = { minLevel: 0, maxLevel: 2 };

/** The meters D29 builds bars in: T1's simple meters, cut time and T2's compound ones. */
export const D29_METERS: readonly string[] = ['2/4', '3/4', '4/4', '2/2', '6/8', '9/8', '12/8'];

/**
 * The card a bar tests: `meter:6/8:feltBeats`, how a bar of 6/8 is felt (2
 * dotted-quarter beats). Filling one is that fact used, not recited
 * (research/02 rule 12), so D29 takes turns with D32 on the same cards.
 */
export function d29Parse(item: Item): string | null {
  const ref = parseMeterItemId(item.id);
  return ref && ref.fact === 'feltBeats' && D29_METERS.includes(ref.meter) ? ref.meter : null;
}

export function d29CanTest(item: Item): boolean {
  return d29Parse(item) !== null;
}

/**
 * The confusion-matrix concept: the meter, as D32 keys it (`meter:6/8`), so
 * a 6/8 bar filled as 3/4 meets the session builder's 6/8–3/4 seed pair.
 */
export function d29Concept(meter: string): string {
  return `meter:${meter}`;
}

export function d29ConceptOf(item: Item): string | null {
  const meter = d29Parse(item);
  return meter ? d29Concept(meter) : null;
}
