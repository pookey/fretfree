import {
  parseDegreeItemId,
  parseSpellChordItemId,
  parseSpellKeyItemId,
  type Item,
} from '../../engine/model';
import { isPracticalMajorKey, isPracticalSpelling, spellChord, type ChordKind } from '../../theory';

/**
 * D7's eager half (design §6, §10): what the session planner needs before
 * the drill's logic has loaded. Keep it small; prompts and grading belong
 * in `logic.ts`.
 */

export const D7_ID = 'spell-it';

/**
 * Scope levels (research/02 rule 5, distractors): 0 offers the answer notes
 * and their enharmonic twins (the confusion the drill is about); 1 offers
 * every letter with ♭, ♮ and ♯.
 */
export const D7_SCOPE = { minLevel: 0, maxLevel: 1 };

/**
 * The items `logic.ts` can build a prompt for: practical major keys, chords
 * spelled without a double accidental, and degrees 2–7 of a practical key.
 */
export function d7CanTest(item: Item): boolean {
  const key = parseSpellKeyItemId(item.id);
  if (key && isPracticalMajorKey(key.tonic)) return true;
  const chord = parseSpellChordItemId(item.id);
  if (chord && isPracticalSpelling(spellChord(chord.root, chord.chord))) return true;
  const deg = parseDegreeItemId(item.id);
  return deg !== null && deg.degree > 1 && isPracticalMajorKey(deg.tonic);
}

export function d7ConceptOf(item: Item): string | null {
  const key = parseSpellKeyItemId(item.id);
  if (key) return `key:${key.tonic}`;
  const chord = parseSpellChordItemId(item.id);
  if (chord) return chordConcept(chord.chord);
  return null;
}

/** Major and minor triads use the seed pair `triad:maj` / `triad:min` (engine/confusions). */
function chordConcept(kind: ChordKind): string {
  if (kind === 'major') return 'triad:maj';
  if (kind === 'minor') return 'triad:min';
  return `chord:${kind}`;
}
