import { parseChordNameItemId, type Item } from '../../engine/model';
import type { ChordKind } from '../../theory';
import { VOICED_KINDS, templatesFor } from '../../theory/voicings';

/**
 * D36's eager half (design §6, §10): what the session planner needs before
 * the drill's logic has loaded. Keep it small; prompts and grading belong
 * in `logic.ts`. `canTest` needs the voicing templates, so they are eager.
 */

export const D36_ID = 'name-the-chord';

/**
 * Adaptive scope (design §3.3 step 4, research/02 rule 5), as D8's:
 * `naturals` (0) roots voicings on natural notes at their lowest position,
 * which brings in the open chords; `all-roots` (1) on any of the 12 pitch
 * classes; `anywhere` (2) at either octave of the neck as well.
 */
export type D36Scope = 'naturals' | 'all-roots' | 'anywhere';

export const D36_SCOPES: readonly D36Scope[] = ['naturals', 'all-roots', 'anywhere'];
export const D36_SCOPE = { minLevel: 0, maxLevel: D36_SCOPES.length - 1 };

/** The quality buttons, in this order: the number row picks them by position. */
export const D36_QUALITIES: readonly ChordKind[] = [
  'major',
  'minor',
  '7',
  'maj7',
  'm7',
  'm7b5',
  'sus2',
  'sus4',
];

export function d36CanTest(item: Item): boolean {
  const ref = parseChordNameItemId(item.id);
  return (
    ref !== null &&
    VOICED_KINDS.includes(ref.chord) &&
    D36_QUALITIES.includes(ref.chord) &&
    templatesFor(ref.chord).some((t) => t.shape === ref.shape)
  );
}

/** The confusion-matrix key of a quality: D7's, so the seed pairs apply. */
export function d36Concept(kind: ChordKind): string {
  if (kind === 'major') return 'triad:maj';
  if (kind === 'minor') return 'triad:min';
  return `chord:${kind}`;
}

export function d36ConceptOf(item: Item): string | null {
  const ref = parseChordNameItemId(item.id);
  return ref ? d36Concept(ref.chord) : null;
}
