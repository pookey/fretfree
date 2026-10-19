import {
  parseIntervalItemId,
  parseSpellChordItemId,
  parseSpellKeyItemId,
  type Item,
} from '../../engine/model';
import type { ChordKind } from '../../theory';

/**
 * D17's eager half (design §6, §10): what the session planner needs before
 * the drill's logic has loaded. Keep it small; prompts and grading belong
 * in `logic.ts`.
 */

export const D17_ID = 'play-sequence';

/**
 * Adaptive scope (design §3.3 step 4, research/02 rule 5), narrowest first:
 *
 * - `placed` (0): the root is marked on the neck, so the learner starts there.
 * - `anywhere` (1): only the root's name is given; finding it is part of the task.
 */
export type D17Scope = 'placed' | 'anywhere';

export const D17_SCOPES: readonly D17Scope[] = ['placed', 'anywhere'];
export const D17_SCOPE = { minLevel: 0, maxLevel: D17_SCOPES.length - 1 };

/** The items `logic.ts` plans a sequence for: C3 intervals, C4 keys and C5 chords. */
export function d17CanTest(item: Item): boolean {
  return (
    parseIntervalItemId(item.id)?.kind === 'interval' ||
    parseSpellKeyItemId(item.id) !== null ||
    parseSpellChordItemId(item.id) !== null
  );
}

/** Major and minor triads use the seed pair `triad:maj` / `triad:min` (engine/confusions). */
function chordConcept(kind: ChordKind): string {
  if (kind === 'major') return 'triad:maj';
  if (kind === 'minor') return 'triad:min';
  return `chord:${kind}`;
}

export function d17ConceptOf(item: Item): string | null {
  const interval = parseIntervalItemId(item.id);
  if (interval?.kind === 'interval') return interval.interval;
  const key = parseSpellKeyItemId(item.id);
  if (key) return `key:${key.tonic}`;
  const chord = parseSpellChordItemId(item.id);
  if (chord) return chordConcept(chord.chord);
  return null;
}
