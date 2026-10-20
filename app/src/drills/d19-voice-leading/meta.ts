import { parseVoiceLeadItemId } from '../../engine/items/voice-lead';
import type { Item } from '../../engine/model';

/**
 * D19's eager half (design §6, §10): what the session planner needs before
 * the drill's logic has loaded. Keep it small; prompts and grading belong
 * in `logic.ts`.
 */

export const D19_ID = 'voice-leading';

/**
 * Adaptive scope (design §3.3 step 4, research/02 rule 5): the keys a prompt
 * may use. `naturals` (0) keys on natural tonics only; `all` (1) any of the
 * 12 major keys, so the triads land at every position.
 */
export type D19Scope = 'naturals' | 'all';

export const D19_SCOPES: readonly D19Scope[] = ['naturals', 'all'];
export const D19_SCOPE = { minLevel: 0, maxLevel: D19_SCOPES.length - 1 };

export function d19CanTest(item: Item): boolean {
  return parseVoiceLeadItemId(item.id) !== null;
}

/** The item's own ID: a confusion pairs one move with another (see `logic.ts`'s header). */
export function d19ConceptOf(item: Item): string | null {
  return d19CanTest(item) ? item.id : null;
}
