import { chromaToPc, type AccidentalPref } from './fretboard';
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
