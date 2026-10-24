import { ENGINE_CONFIG } from '../../engine/config';
import { parseRhythmCellItemId } from '../../engine/items/rhythm-cell';
import type { Item } from '../../engine/model';

/**
 * D27's eager half (design §6, §10): what the session planner needs before
 * the drill's logic has loaded. Keep it small; prompts and grading belong
 * in `logic.ts`.
 */

export const D27_ID = 'rhythm-reading';

/** Adaptive scope (research/02 rule 5): how the bar is written, and its tempo band. */
export const D27_SCOPE = {
  minLevel: 0,
  maxLevel: ENGINE_CONFIG.rhythmReading.levels.length - 1,
};

export function d27CanTest(item: Item): boolean {
  return parseRhythmCellItemId(item.id) !== null;
}

/**
 * The confusion-matrix concept: the cell (`rhythm:dotted-8th-16th`). A rep
 * that fits the cell's confusable partner better than the cell is logged as
 * that confusion, and the dotted-vs-straight seed pairs
 * (`engine/confusions.ts`) mix the two in a session from the start (rule 6).
 */
export function d27ConceptOf(item: Item): string | null {
  return d27CanTest(item) ? item.id : null;
}
