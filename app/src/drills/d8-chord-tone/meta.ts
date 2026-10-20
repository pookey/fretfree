import { parseChordToneItemId, type Item } from '../../engine/model';
import type { ChordDegree } from '../../theory';
import { isD8Kind, templatesFor } from './voicings';

/**
 * D8's eager half (design §6, §10): what the session planner needs before
 * the drill's logic has loaded. Keep it small; prompts and grading belong
 * in `logic.ts`.
 */

export const D8_ID = 'chord-tone';

/**
 * Adaptive scope (design §3.3 step 4, research/02 rule 5): `naturals` (0)
 * roots shapes on natural notes at their lowest position, which brings in
 * the open chords; `all-roots` (1) on any of the 12 pitch classes; `anywhere`
 * (2) at either octave of the neck as well.
 */
export type D8Scope = 'naturals' | 'all-roots' | 'anywhere';

export const D8_SCOPES: readonly D8Scope[] = ['naturals', 'all-roots', 'anywhere'];
export const D8_SCOPE = { minLevel: 0, maxLevel: D8_SCOPES.length - 1 };

/** Intervals from the root, as the confusion matrix keys them (engine/confusions.ts). */
export const INTERVAL: Partial<Record<ChordDegree, string>> = {
  '1': 'P1',
  b3: 'm3',
  '3': 'M3',
  '5': 'P5',
  b7: 'm7',
  '7': 'M7',
};

/** A D8 kind and degree, with a shape that holds the degree (the C-shape 7 has no 5th). */
export function d8CanTest(item: Item): boolean {
  const ref = parseChordToneItemId(item.id);
  return (
    ref !== null &&
    isD8Kind(ref.chord) &&
    ref.degree in INTERVAL &&
    templatesFor(ref.chord).some((t) => t.notes.some((n) => n.degree === ref.degree))
  );
}

export function d8ConceptOf(item: Item): string | null {
  const ref = parseChordToneItemId(item.id);
  return ref ? (INTERVAL[ref.degree] ?? null) : null;
}
