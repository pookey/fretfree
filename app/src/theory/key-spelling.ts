import { Note } from 'tonal';
import { spellChord, type ChordKind } from './chords';
import {
  STANDARD_TUNING,
  chromaOf,
  chromaToPc,
  midiAt,
  type AccidentalPref,
  type FretNote,
  type Position,
  type Tuning,
} from './fretboard';
import type { CagedQuality } from './shapes';

/**
 * Each major key's signature direction by its tonic's chroma: 1 sharps,
 * -1 flats, 0 for C and for F♯/G♭, which have six either way.
 */
const MAJOR_KEY_SIGN = [0, -1, 1, -1, 1, -1, 0, 1, -1, 1, -1, 1] as const;

const mod12 = (n: number) => ((n % 12) + 12) % 12;

/**
 * How a chord's key is spelled (design §8, research/02 rule 4: a label must
 * never mislead): with flats in a flat key (B♭, not A♯; Dm names its notes
 * with flats), with sharps in a sharp key (C♯m, not D♭m), and by the
 * learner's preference in C, Am, F♯/G♭ and D♯m/E♭m. A minor chord takes its
 * relative major's key; a 7 chord, its root's major key, or where that has
 * none (C7, F♯7) the key it is V of, a 4th up (C7's ♭7 is B♭, from F).
 */
export function chordKeySpelling(
  rootChroma: number,
  quality: CagedQuality,
  accidentalPref: AccidentalPref,
): AccidentalPref {
  const root = mod12(rootChroma);
  const tonic = quality === 'minor' ? root + 3 : root;
  let sign: number | undefined = MAJOR_KEY_SIGN[tonic % 12];
  if (!sign && quality === 'dominant7') sign = MAJOR_KEY_SIGN[(root + 5) % 12];
  if (!sign) return accidentalPref;
  return sign > 0 ? 'sharp' : 'flat';
}

/** The chord's root spelled from its key (`chordKeySpelling`): B♭, never A♯. */
export function keySpelledRoot(
  rootChroma: number,
  quality: CagedQuality,
  accidentalPref: AccidentalPref,
): string {
  return chromaToPc(rootChroma, chordKeySpelling(rootChroma, quality, accidentalPref));
}

const CHORD_KIND: Record<CagedQuality, ChordKind> = {
  major: 'major',
  minor: 'minor',
  dominant7: '7',
};

/**
 * A chord's tones by chroma, spelled from the chord itself (tonal's chord
 * notes on `keySpelledRoot`), as the CAGED view names them: D♭7's ♭7 is C♭,
 * not B, and B♭'s 3rd is D (research/02 rule 4).
 */
export function chordToneNames(
  rootChroma: number,
  quality: CagedQuality,
  accidentalPref: AccidentalPref,
): ReadonlyMap<number, string> {
  const root = keySpelledRoot(rootChroma, quality, accidentalPref);
  return new Map(spellChord(root, CHORD_KIND[quality]).map((pc) => [chromaOf(pc), pc]));
}

/**
 * A pitch class named within a chord: a chord tone as the chord spells it
 * (`chordToneNames`), any other note by the chord's key (`chordKeySpelling`).
 */
export function spellInChord(
  chroma: number,
  rootChroma: number,
  quality: CagedQuality,
  accidentalPref: AccidentalPref,
): string {
  const c = mod12(chroma);
  return (
    chordToneNames(rootChroma, quality, accidentalPref).get(c) ??
    chromaToPc(c, chordKeySpelling(rootChroma, quality, accidentalPref))
  );
}

const LETTER_CHROMA: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/**
 * A cell's note named within a chord (`spellInChord`), its octave counted
 * from the letter: D♭7's ♭7 on the open B string is Cb4, the pitch of B3.
 */
export function noteInChord(
  pos: Position,
  rootChroma: number,
  quality: CagedQuality,
  accidentalPref: AccidentalPref,
  tuning: Tuning = STANDARD_TUNING,
): FretNote {
  const midi = midiAt(pos, tuning);
  const chroma = mod12(midi);
  const pc = spellInChord(chroma, rootChroma, quality, accidentalPref);
  const { letter, alt } = Note.get(pc);
  const octave = (midi - alt - (LETTER_CHROMA[letter] ?? 0)) / 12 - 1;
  return { pc, name: `${pc}${octave}`, midi, chroma };
}
