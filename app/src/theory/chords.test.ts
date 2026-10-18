import { describe, expect, it } from 'vitest';
import { Note } from 'tonal';
import { chromaOf } from './fretboard';
import { CHORD_QUALITIES, chordTones } from './harmony';
import {
  C5_CHORD_KINDS,
  CHORD_KINDS,
  CONFUSABLE_CHORD_KINDS,
  chordDegreeSemitones,
  chordDifference,
  chordFormula,
  chordKindInfo,
  chordNotes,
  chordToneOf,
  degreeInChord,
  fromHarmonyQuality,
  isChordKind,
  isChordVoicing,
  isPracticalSpelling,
  nameChord,
  parseChord,
  spellChord,
  type ChordKind,
} from './chords';

const ROOTS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'].flatMap((l) => [l, `${l}#`, `${l}b`]);
const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const KINDS = CHORD_KINDS.map((k) => k.kind);

/** Letter steps above the root implied by a formula degree: 3 → 2, b7 → 6, 9 → 1. */
function letterSteps(degree: string): number {
  return (Number(degree.replace(/[b#]/g, '')) - 1) % 7;
}

describe('spellChord', () => {
  it('spells the C5 examples', () => {
    expect(spellChord('B', 'm7')).toEqual(['B', 'D', 'F#', 'A']);
    expect(spellChord('C', 'maj7')).toEqual(['C', 'E', 'G', 'B']);
    expect(spellChord('G', '7')).toEqual(['G', 'B', 'D', 'F']);
    expect(spellChord('F#', 'm7b5')).toEqual(['F#', 'A', 'C', 'E']);
    expect(spellChord('D', 'sus2')).toEqual(['D', 'E', 'A']);
    expect(spellChord('A', 'sus4')).toEqual(['A', 'D', 'E']);
    expect(spellChord('E', 'add9')).toEqual(['E', 'G#', 'B', 'F#']);
    expect(spellChord('Bb', 'diminished')).toEqual(['Bb', 'Db', 'Fb']);
    expect(spellChord('C', 'augmented')).toEqual(['C', 'E', 'G#']);
    expect(spellChord('C', 'dim7')).toEqual(['C', 'Eb', 'Gb', 'Bbb']);
    expect(spellChord('Eb', 'minor')).toEqual(['Eb', 'Gb', 'Bb']);
  });

  it('spells every kind on every root with the right pitches and letters', () => {
    for (const root of ROOTS) {
      for (const kind of KINDS) {
        const notes = spellChord(root, kind);
        const formula = chordFormula(kind);
        const label = `${root}${kind}`;
        expect(notes, label).toHaveLength(formula.length);
        expect(notes[0], label).toBe(root);
        const rootLetter = LETTERS.indexOf(Note.get(root).letter);
        notes.forEach((n, i) => {
          const degree = formula[i] as (typeof formula)[number];
          const semis = (((chromaOf(n) - chromaOf(root)) % 12) + 12) % 12;
          expect(semis, `${label} ${degree}`).toBe(chordDegreeSemitones(degree) % 12);
          expect(Note.get(n).letter, `${label} ${degree}`).toBe(
            LETTERS[(rootLetter + letterSteps(degree)) % 7],
          );
        });
      }
    }
  });

  it('agrees with harmony.ts for every shared quality', () => {
    for (const root of ROOTS) {
      for (const q of CHORD_QUALITIES) {
        expect(spellChord(root, fromHarmonyQuality(q)), `${root} ${q}`).toEqual(
          chordTones({ root, quality: q }),
        );
      }
    }
  });

  it('rejects invalid roots', () => {
    expect(() => spellChord('H', 'major')).toThrow();
    expect(() => spellChord('C4', 'major')).toThrow();
  });
});

describe('kind catalogue', () => {
  it('orders families triads → sevenths → sus → add', () => {
    const order = ['triad', 'seventh', 'suspended', 'added'];
    const ranks = CHORD_KINDS.map((k) => order.indexOf(k.family));
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    expect(new Set(KINDS).size).toBe(KINDS.length);
  });

  it('covers the C5 list and valid confusable pairs', () => {
    expect(C5_CHORD_KINDS).toEqual(
      expect.arrayContaining(['major', 'minor', 'maj7', '7', 'm7', 'm7b5', 'sus2', 'sus4', 'add9']),
    );
    for (const k of C5_CHORD_KINDS) expect(isChordKind(k)).toBe(true);
    for (const [a, b] of CONFUSABLE_CHORD_KINDS) {
      expect(isChordKind(a) && isChordKind(b)).toBe(true);
      const d = chordDifference(a, b);
      expect(d.onlyA.length + d.onlyB.length, `${a}/${b}`).toBeGreaterThan(0);
    }
  });

  it('looks kinds up and rejects unknown ones', () => {
    expect(chordKindInfo('m7b5').name).toBe('half-diminished seventh');
    expect(isChordKind('9')).toBe(false);
    expect(() => chordKindInfo('9' as ChordKind)).toThrow();
  });
});

describe('symbols', () => {
  it('names and parses every kind on every root', () => {
    for (const root of ROOTS) {
      for (const kind of KINDS) {
        const symbol = nameChord(root, kind);
        expect(parseChord(symbol)).toEqual({ root, kind });
        expect(chordNotes(symbol)).toEqual(spellChord(root, kind));
      }
    }
    expect(nameChord('B', 'm7')).toBe('Bm7');
    expect(nameChord('C', 'major')).toBe('C');
  });

  it('accepts common aliases', () => {
    const cases: [string, ChordKind][] = [
      ['CM', 'major'],
      ['Cmaj', 'major'],
      ['C-', 'minor'],
      ['Cmin', 'minor'],
      ['C°', 'diminished'],
      ['C+', 'augmented'],
      ['CM7', 'maj7'],
      ['CΔ', 'maj7'],
      ['CΔ7', 'maj7'],
      ['Cdom7', '7'],
      ['C-7', 'm7'],
      ['Cmin7', 'm7'],
      ['Cø', 'm7b5'],
      ['Cø7', 'm7b5'],
      ['C-7b5', 'm7b5'],
      ['C°7', 'dim7'],
      ['Co7', 'dim7'],
      ['Co', 'diminished'],
      ['Csus', 'sus4'],
      ['Cadd2', 'add9'],
      [' C7 ', '7'],
    ];
    for (const [symbol, kind] of cases) expect(parseChord(symbol).kind, symbol).toBe(kind);
  });

  it('rejects junk', () => {
    for (const bad of ['', 'H7', 'C9', 'Cfoo', 'c7', 'C2']) {
      expect(() => parseChord(bad), bad).toThrow();
    }
  });
});

describe('chord tones', () => {
  it('finds a named degree, or null when absent', () => {
    expect(chordToneOf('D', '7', '3')).toBe('F#');
    expect(chordToneOf('D', '7', 'b7')).toBe('C');
    expect(chordToneOf('D', 'maj7', '7')).toBe('C#');
    expect(chordToneOf('D', 'maj7', 'b7')).toBeNull();
    expect(chordToneOf('C', 'sus4', '3')).toBeNull();
    expect(chordToneOf('C', 'add9', '9')).toBe('D');
  });

  it('round-trips tone ↔ degree for every kind and root', () => {
    for (const root of ROOTS) {
      for (const kind of KINDS) {
        for (const degree of chordFormula(kind)) {
          const note = chordToneOf(root, kind, degree) as string;
          expect(degreeInChord(root, kind, note), `${root}${kind} ${degree}`).toBe(degree);
        }
      }
    }
  });

  it('matches degrees by pitch', () => {
    expect(degreeInChord('D', '7', 'Gb')).toBe('3');
    expect(degreeInChord('D', '7', 'E')).toBeNull();
  });
});

describe('chordDifference', () => {
  it('explains 7 vs maj7 and m7 vs m7b5', () => {
    expect(chordDifference('7', 'maj7')).toEqual({ onlyA: ['b7'], onlyB: ['7'] });
    expect(chordDifference('m7', 'm7b5')).toEqual({ onlyA: ['5'], onlyB: ['b5'] });
    expect(chordDifference('major', 'major')).toEqual({ onlyA: [], onlyB: [] });
  });
});

describe('isChordVoicing', () => {
  it('accepts any order, doubling or spelling of exactly the chord tones', () => {
    expect(isChordVoicing('C', 'major', ['E', 'C', 'G', 'C'])).toBe(true);
    expect(isChordVoicing('C', 'major', ['C', 'E'])).toBe(false);
    expect(isChordVoicing('C', 'major', ['C', 'E', 'G', 'B'])).toBe(false);
    expect(isChordVoicing('F#', 'm7b5', ['Gb', 'A', 'C', 'E'])).toBe(true);
  });
});

describe('isPracticalSpelling', () => {
  it('flags double accidentals', () => {
    expect(isPracticalSpelling(spellChord('F#', 'diminished'))).toBe(true);
    expect(isPracticalSpelling(spellChord('Gb', 'diminished'))).toBe(false);
    expect(isPracticalSpelling(['C', 'E#', 'G##'])).toBe(false);
  });
});
