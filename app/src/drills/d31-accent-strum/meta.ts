import { ENGINE_CONFIG } from '../../engine/config';
import { parseAccentItemId, patternMeter } from '../../engine/items/accent';
import type { Item } from '../../engine/model';

/**
 * D31's eager half (design §6, §10): what the session planner needs before
 * the drill's logic has loaded. Keep it small; prompts and grading belong
 * in `logic.ts`.
 */

export const D31_ID = 'accent-strum';

/** Adaptive scope (research/02 rule 5): one level per tempo band, slowest first. */
export const D31_SCOPE = { minLevel: 0, maxLevel: ENGINE_CONFIG.accentStrum.tempoBands.length - 1 };

export function d31CanTest(item: Item): boolean {
  return parseAccentItemId(item.id) !== null;
}

/**
 * The confusion-matrix concept: `meter:4/4`, the bar's meter, as D30 and D32
 * key theirs. The seed pairs (`engine/confusions.ts`) then mix 4/4 triplets
 * with 12/8 and 3/4 with 6/8 in a session (rule 6): the same bar, accented
 * another way.
 */
export function d31ConceptOf(item: Item): string | null {
  const ref = parseAccentItemId(item.id);
  return ref ? `meter:${patternMeter(ref.pattern)}` : null;
}
