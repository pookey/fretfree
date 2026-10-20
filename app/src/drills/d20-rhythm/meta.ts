import { ENGINE_CONFIG } from '../../engine/config';
import { parseRhythmPatternItemId } from '../../engine/items/rhythm-pattern';
import type { Item } from '../../engine/model';

/**
 * D20's eager half (design §6, §10): what the session planner needs before
 * the drill's logic has loaded. Keep it small; prompts and grading belong
 * in `logic.ts`.
 */

export const D20_ID = 'tap-strum-rhythm';

/** Adaptive scope (research/02 rule 5): one level per tempo band, slowest first. */
export const D20_SCOPE = { minLevel: 0, maxLevel: ENGINE_CONFIG.rhythm.tempoBands.length - 1 };

export function d20CanTest(item: Item): boolean {
  return parseRhythmPatternItemId(item.id) !== null;
}

/** Each rhythm is its own concept: a timing miss confuses it with nothing. */
export function d20ConceptOf(item: Item): string | null {
  return d20CanTest(item) ? item.id : null;
}
