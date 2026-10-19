import { parseBuildChordItemId, type Item } from '../../engine/model';
import type { ChordKind } from '../../theory';

/**
 * D38's eager half (design §6, §10): what the session planner needs before
 * the drill's logic has loaded. Keep it small; prompts and grading belong
 * in `logic.ts`.
 */

export const D38_ID = 'build-the-chord';

/**
 * Adaptive scope (design §3.3 step 4, research/02 rule 5): `naturals` (0)
 * roots on natural notes at their lowest fret, which brings in the open
 * chords; `all-roots` (1) on any of the 12 pitch classes; `anywhere` (2) at
 * either octave of the neck as well.
 */
export type D38Scope = 'naturals' | 'all-roots' | 'anywhere';

export const D38_SCOPES: readonly D38Scope[] = ['naturals', 'all-roots', 'anywhere'];
export const D38_SCOPE = { minLevel: 0, maxLevel: D38_SCOPES.length - 1 };

export function d38CanTest(item: Item): boolean {
  const ref = parseBuildChordItemId(item.id);
  return ref !== null && ref.string >= 2;
}

/** The confusion-matrix key of a quality: D7's and D36's, so the seed pairs apply. */
export function d38Concept(kind: ChordKind): string {
  if (kind === 'major') return 'triad:maj';
  if (kind === 'minor') return 'triad:min';
  return `chord:${kind}`;
}

export function d38ConceptOf(item: Item): string | null {
  const ref = parseBuildChordItemId(item.id);
  return ref ? d38Concept(ref.chord) : null;
}
