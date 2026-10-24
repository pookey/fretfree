import { describe, expect, it } from 'vitest';
import { Note } from 'tonal';
import { spellChord } from './chords';
import { DROP_D_TUNING, chromaOf, midiAt, type AccidentalPref } from './fretboard';
import {
  chordKeySpelling,
  chordToneNames,
  keySpelledRoot,
  noteInChord,
  spellInChord,
} from './key-spelling';
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

const KINDS = { major: 'major', minor: 'minor', dominant7: '7' } as const;
const LETTERS = 'CDEFGAB';

describe('chordToneNames', () => {
  it('spells D♭7 with C♭ and F♯7 with E, whatever the preference', () => {
    for (const pref of PREFS) {
      expect([...chordToneNames(1, 'dominant7', pref)]).toEqual([
        [1, 'Db'],
        [5, 'F'],
        [8, 'Ab'],
        [11, 'Cb'],
      ]);
      expect(chordToneNames(6, 'dominant7', pref).get(4)).toBe('E');
      expect(chordToneNames(10, 'major', pref).get(2)).toBe('D');
      expect(chordToneNames(1, 'minor', pref).get(8)).toBe('G#');
    }
  });

  for (const quality of QUALITIES) {
    for (const pref of PREFS) {
      it(`spells every ${quality} chord in thirds from its key-spelled root, preferring ${pref}s`, () => {
        for (let chroma = 0; chroma < 12; chroma++) {
          const root = keySpelledRoot(chroma, quality, pref);
          const tones = chordToneNames(chroma, quality, pref);
          expect([...tones.values()]).toEqual(spellChord(root, KINDS[quality]));
          expect(tones.get(chroma)).toBe(root);
          // Stacked thirds: each tone is two letters above the last.
          const letters = [...tones.values()].map((pc) => LETTERS.indexOf(pc[0] as string));
          letters.forEach((l, i) => {
            if (i > 0) expect(l).toBe(((letters[i - 1] as number) + 2) % 7);
          });
          for (const [c, pc] of tones) expect(chromaOf(pc)).toBe(c);
        }
      });
    }
  }
});

describe('spellInChord', () => {
  it('names a chord tone as the chord spells it', () => {
    expect(spellInChord(11, 1, 'dominant7', 'sharp')).toBe('Cb');
    expect(spellInChord(4, 6, 'dominant7', 'flat')).toBe('E');
    expect(spellInChord(23, 1, 'dominant7', 'sharp')).toBe('Cb');
  });

  it("names any other note by the chord's key", () => {
    expect(spellInChord(6, 1, 'dominant7', 'sharp')).toBe('Gb'); // not in D♭7
    expect(spellInChord(1, 4, 'major', 'flat')).toBe('C#'); // not in E
    expect(spellInChord(-2, 0, 'major', 'sharp')).toBe('A#'); // C: the preference
  });
});

describe('noteInChord', () => {
  it('counts the octave from the letter: D♭7 on the open B string is C♭4', () => {
    const open = { string: 2, fret: 0 };
    expect(noteInChord(open, 1, 'dominant7', 'sharp')).toEqual({
      pc: 'Cb',
      name: 'Cb4',
      midi: 59,
      chroma: 11,
    });
    expect(Note.midi('Cb4')).toBe(midiAt(open));
    expect(noteInChord(open, 4, 'major', 'flat').name).toBe('B3');
    expect(noteInChord({ string: 3, fret: 3 }, 6, 'dominant7', 'flat').name).toBe('A#3');
  });

  it('reads the cell in the tuning given', () => {
    const low = { string: 6, fret: 0 };
    expect(noteInChord(low, 2, 'major', 'sharp', DROP_D_TUNING).name).toBe('D2');
    expect(noteInChord(low, 2, 'major', 'sharp').name).toBe('E2');
  });

  it('keeps the pitch of every cell, whatever the chord', () => {
    for (const quality of QUALITIES) {
      for (let chroma = 0; chroma < 12; chroma++) {
        for (let fret = 0; fret <= 12; fret++) {
          const pos = { string: 2, fret };
          const note = noteInChord(pos, chroma, quality, 'flat');
          expect(Note.midi(note.name)).toBe(midiAt(pos));
        }
      }
    }
  });
});
