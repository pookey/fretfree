import { parseMeterEarItemId, type EarMeter } from '../../engine/items/meter-ear';
import type { Item } from '../../engine/model';

/**
 * D30's eager half (design §6, §10): what the session planner needs before
 * the drill's logic has loaded. Keep it small; prompts and grading belong
 * in `logic.ts`.
 */

export const D30_ID = 'hear-the-meter';

/**
 * Scope levels (research/02 rule 5, distractors): the answer's own kind
 * (3/4 or 4/4: count the beats), then its confusable pair (3/4 or 6/8: how
 * the beat splits), then all six meters. See `items/meter-ear.ts`.
 */
export const D30_SCOPE = { minLevel: 0, maxLevel: 2 };

export function d30Meter(item: Item): EarMeter | null {
  return parseMeterEarItemId(item.id)?.meter ?? null;
}

export function d30CanTest(item: Item): boolean {
  return d30Meter(item) !== null;
}

/**
 * The confusion-matrix concept: `meter:6/8`, the meter itself, so the seed
 * pairs 6/8–3/4 and 12/8–4/4 (`engine/confusions.ts`) pair its cards in a
 * session (rule 6), and a drill that reads the same meter can share them.
 */
export function d30Concept(meter: string): string {
  return `meter:${meter}`;
}

export function d30ConceptOf(item: Item): string | null {
  const meter = d30Meter(item);
  return meter ? d30Concept(meter) : null;
}
