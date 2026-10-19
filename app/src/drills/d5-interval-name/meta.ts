import { parseIntervalItemId, type Item } from '../../engine/model';
import type { IntervalName } from '../../theory';

/**
 * D5's eager half (design §6, §10): what the session planner needs before
 * the drill's logic has loaded. Keep it small; prompts and grading belong
 * in `logic.ts`.
 */

export const D5_ID = 'interval-name';

/**
 * Scope levels (research/02 rule 5, distractors): the answer among its nearest
 * neighbours by size, which are the easiest to confuse (a fret apart, rule 6),
 * then a wider window, then every interval from m2 to P8.
 */
export const D5_SCOPE = { minLevel: 0, maxLevel: 2 };

export function d5CanTest(item: Item): boolean {
  return parseIntervalItemId(item.id)?.kind === 'interval-name';
}

/** The item's interval and strings. Throws for another drill's item. */
export function d5Parse(item: Item): { interval: IntervalName; from: number; to: number } {
  const ref = parseIntervalItemId(item.id);
  if (ref?.kind !== 'interval-name') throw new Error(`D5 cannot test item ${item.id}`);
  return ref;
}

export function d5ConceptOf(item: Item): string | null {
  return d5CanTest(item) ? d5Parse(item).interval : null;
}
