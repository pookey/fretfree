import { describe, expect, it } from 'vitest';
import type { AccidentalPref } from './fretboard';
import { chordKeySpelling, keySpelledRoot } from './key-spelling';
import type { CagedQuality } from './shapes';

/** Each root's key spelling by quality: a fixed direction, or `pref` where the key has none. */
type Expected = AccidentalPref | 'pref';

const TABLE: Record<CagedQuality, readonly Expected[]> = {
  //     C       C♯/D♭   D        D♯/E♭   E        F       F♯/G♭   G        G♯/A♭   A        A♯/B♭   B
  major: [
    'pref',
    'flat',
    'sharp',
    'flat',
    'sharp',
    'flat',
    'pref',
    'sharp',
    'flat',
    'sharp',
    'flat',
    'sharp',
  ],
  // From the relative major: Cm from E♭, C♯m from E, D♯m/E♭m from F♯/G♭, Am from C.
  minor: [
    'flat',
    'sharp',
    'flat',
    'pref',
    'sharp',
    'flat',
    'sharp',
    'flat',
    'sharp',
    'pref',
    'flat',
    'sharp',
  ],
  // C7 from F, F♯7 from B: the keys they are V of.
  dominant7: [
    'flat',
    'flat',
    'sharp',
    'flat',
    'sharp',
    'flat',
    'sharp',
    'sharp',
    'flat',
    'sharp',
    'flat',
    'sharp',
  ],
};

const ROOTS: Record<CagedQuality, Record<AccidentalPref, readonly string[]>> = {
  major: {
    sharp: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'],
    flat: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'],
  },
  minor: {
    sharp: ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'],
    flat: ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'],
  },
  dominant7: {
    sharp: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'],
    flat: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'],
  },
};

const QUALITIES = ['major', 'minor', 'dominant7'] as const;
const PREFS = ['sharp', 'flat'] as const;

describe('chordKeySpelling', () => {
  for (const quality of QUALITIES) {
    for (const pref of PREFS) {
      it(`spells every ${quality} root from its key, preferring ${pref}s`, () => {
        for (let chroma = 0; chroma < 12; chroma++) {
          const want = TABLE[quality][chroma];
          expect(chordKeySpelling(chroma, quality, pref)).toBe(want === 'pref' ? pref : want);
          expect(keySpelledRoot(chroma, quality, pref)).toBe(ROOTS[quality][pref][chroma]);
        }
      });
    }
  }

  it('spells flat keys with flats and sharp keys with sharps, whatever the preference', () => {
    expect(chordKeySpelling(10, 'major', 'sharp')).toBe('flat'); // B♭
    expect(chordKeySpelling(5, 'dominant7', 'sharp')).toBe('flat'); // F7
    expect(chordKeySpelling(1, 'dominant7', 'sharp')).toBe('flat'); // D♭7, its own key
    expect(chordKeySpelling(0, 'dominant7', 'sharp')).toBe('flat'); // C7's ♭7 is B♭, from F
    expect(chordKeySpelling(6, 'dominant7', 'flat')).toBe('sharp'); // F♯7's ♭7 is E, from B
    expect(chordKeySpelling(2, 'minor', 'sharp')).toBe('flat'); // Dm, from F
    expect(chordKeySpelling(1, 'minor', 'flat')).toBe('sharp'); // C♯m, from E
    expect(chordKeySpelling(4, 'major', 'flat')).toBe('sharp'); // E
  });

  it('takes any chroma, wrapping it into one octave', () => {
    expect(chordKeySpelling(22, 'major', 'sharp')).toBe('flat');
    expect(chordKeySpelling(-2, 'major', 'sharp')).toBe('flat');
    expect(keySpelledRoot(-2, 'major', 'sharp')).toBe('Bb');
  });
});
