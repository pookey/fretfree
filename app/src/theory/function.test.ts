import { describe, expect, it } from 'vitest';
import { CHROMATIC_ROOTS } from '../test/fixtures';
import { chromaOf } from './fretboard';
import {
  analyseChord,
  borrowedChords,
  chordReadings,
  diatonicFunction,
  findBorrowed,
  functionOf,
  harmonicMinorChords,
  harmonicMinorScale,
  isBorrowed,
  leadingTone,
  minorKeyChords,
  raisedSeventh,
  relativeSubstitute,
  secondaryDominants,
  substitutes,
  tritoneSubstitute,
  twoFiveOne,
} from './function';
import {
  chordSymbol,
  chordTones,
  diatonicChords,
  isDiatonic,
  majorKey,
  minorKey,
  type ChordSpec,
  type MusicalKey,
} from './harmony';

const C = majorKey('C');
const Am = minorKey('A');
const KEYS: MusicalKey[] = CHROMATIC_ROOTS.flatMap((t) => [majorKey(t), minorKey(t)]);
const symbols = (chords: readonly { symbol: string }[]) => chords.map((c) => c.symbol);
const labels = (key: MusicalKey, chord: string) => chordReadings(key, chord).map((r) => r.label);
const pcs = (chord: ChordSpec) => new Set(chordTones(chord).map(chromaOf));

describe('diatonicFunction', () => {
  it('groups the degrees into tonic, subdominant and dominant', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map((d) => diatonicFunction('major', d as 1))).toEqual([
      'tonic',
      'subdominant',
      'tonic',
      'subdominant',
      'dominant',
      'tonic',
      'dominant',
    ]);
    expect([1, 2, 3, 4, 5, 6, 7].map((d) => diatonicFunction('minor', d as 1))).toEqual([
      'tonic',
      'subdominant',
      'tonic',
      'subdominant',
      'dominant',
      'subdominant',
      'dominant',
    ]);
  });
});

describe('minor-key harmony', () => {
  it('spells harmonic minor with the raised 7th', () => {
    expect(harmonicMinorScale('A')).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G#']);
    expect(harmonicMinorScale('C')).toEqual(['C', 'D', 'Eb', 'F', 'G', 'Ab', 'B']);
    expect(harmonicMinorScale('Bb').at(-1)).toBe('A');
    expect(() => harmonicMinorScale('H')).toThrow();
  });

  it('names the natural and raised 7th and the leading tone', () => {
    expect(raisedSeventh('A')).toEqual({ natural: 'G', raised: 'G#' });
    expect(raisedSeventh('D')).toEqual({ natural: 'C', raised: 'C#' });
    expect(raisedSeventh('G#')).toEqual({ natural: 'F#', raised: 'F##' });
    expect(leadingTone(Am)).toBe('G#');
    expect(leadingTone(majorKey('F'))).toBe('E');
  });

  it('adds the harmonic-minor V and vii°', () => {
    expect(symbols(harmonicMinorChords('A'))).toEqual(['E', 'G#dim']);
    const sevenths = harmonicMinorChords('A', { sevenths: true });
    expect(symbols(sevenths)).toEqual(['E7', 'G#dim7']);
    expect(sevenths.map((c) => c.roman)).toEqual(['V7', 'vii°7']);
    expect(symbols(harmonicMinorChords('C', { sevenths: true }))).toEqual(['G7', 'Bdim7']);
  });

  it('lists the working chords of a minor key by degree', () => {
    const chords = minorKeyChords('A');
    expect(chords.map((c) => `${c.symbol} ${c.roman} ${c.source}`)).toEqual([
      'Am i natural',
      'Bdim ii° natural',
      'C bIII natural',
      'Dm iv natural',
      'Em v natural',
      'E V harmonic',
      'F bVI natural',
      'G bVII natural',
      'G#dim vii° harmonic',
    ]);
    expect(symbols(minorKeyChords('E', { sevenths: true }))).toContain('B7');
  });

  it('builds ii–V–I in major and minor', () => {
    expect(symbols(twoFiveOne(C))).toEqual(['Dm7', 'G7', 'Cmaj7']);
    expect(symbols(twoFiveOne(C, { sevenths: false }))).toEqual(['Dm', 'G', 'C']);
    expect(symbols(twoFiveOne(Am))).toEqual(['Bm7b5', 'E7', 'Am']);
    expect(twoFiveOne(Am).map((c) => c.roman)).toEqual(['iiø7', 'V7', 'i']);
    expect(symbols(twoFiveOne(Am, { sevenths: false }))).toEqual(['Bdim', 'E', 'Am']);
    expect(symbols(twoFiveOne(minorKey('F#')))).toEqual(['G#m7b5', 'C#7', 'F#m']);
  });

  it('explains E7 in A minor (research/03 I4 misconception)', () => {
    expect(isDiatonic(Am, 'E7')).toBe(false); // not in natural minor…
    const reading = analyseChord(Am, 'E7');
    expect(reading).toMatchObject({ role: 'harmonic-minor', function: 'dominant', label: 'V7' });
    expect(reading?.explanation).toContain('A harmonic minor');
    expect(reading?.explanation).toContain('G to G#');
    expect(analyseChord(Am, 'G#dim7')).toMatchObject({ role: 'harmonic-minor', label: 'vii°7' });
  });
});

describe('chordReadings', () => {
  it('reads diatonic chords by degree, with their function', () => {
    expect(analyseChord(C, 'Dm')).toMatchObject({
      role: 'diatonic',
      function: 'subdominant',
      label: 'ii',
    });
    expect(analyseChord(C, 'G7')).toMatchObject({ role: 'diatonic', label: 'V7' });
    expect(analyseChord(Am, 'C')).toMatchObject({ function: 'tonic', label: 'bIII' });
    expect(analyseChord(Am, 'F')).toMatchObject({ function: 'subdominant', label: 'bVI' });
    expect(analyseChord(Am, 'G')).toMatchObject({ function: 'dominant', label: 'bVII' });
    expect(analyseChord(C, 'Em')?.explanation).toBe(
      'Em is iii in C major: a diatonic chord with tonic function.',
    );
  });

  it('gives every diatonic chord in every key exactly one reading', () => {
    for (const key of KEYS) {
      for (const sevenths of [false, true]) {
        for (const chord of diatonicChords(key, { sevenths })) {
          const readings = chordReadings(key, chord);
          expect(readings, `${chord.symbol} in ${key.tonic} ${key.mode}`).toHaveLength(1);
          expect(readings[0]).toMatchObject({
            role: 'diatonic',
            label: chord.roman,
            function: diatonicFunction(key.mode, chord.degree),
          });
        }
      }
    }
  });

  it('reads secondary dominants: A7 is V7/ii in C', () => {
    expect(analyseChord(C, 'A7')).toMatchObject({
      role: 'secondary-dominant',
      function: 'dominant',
      label: 'V7/ii',
      target: 'ii',
    });
    expect(analyseChord(C, 'A7')?.explanation).toBe('A7 is V7/ii in C major: the dominant of Dm.');
    expect(labels(C, 'D')).toEqual(['V/V']);
    expect(labels(C, 'B7')).toEqual(['V7/iii']);
    expect(labels(C, 'C7')).toEqual(['V7/IV']);
    expect(labels(C, 'E')).toEqual(['V/vi']);
    expect(labels(Am, 'B7')).toEqual(['V7/V']);
  });

  it('reads borrowed chords from the parallel key', () => {
    const fm = analyseChord(C, 'Fm');
    expect(fm).toMatchObject({ role: 'borrowed', function: 'subdominant', label: 'iv' });
    expect(fm?.source).toEqual(minorKey('C'));
    expect(fm?.explanation).toBe('Fm is iv in C major, borrowed from C minor.');
    expect(labels(C, 'Ab')).toEqual(['bVI']);
    expect(labels(C, 'Bb')).toEqual(['bVII']);
    expect(labels(C, 'Eb')).toEqual(['bIII']);
    expect(analyseChord(Am, 'F#m')).toMatchObject({ role: 'borrowed', label: 'vi' });
  });

  it('reads tritone substitutes: Db7 is subV7 in C', () => {
    expect(analyseChord(C, 'Db7')).toMatchObject({
      role: 'tritone-substitute',
      function: 'dominant',
      label: 'subV7',
      target: 'I',
    });
    expect(analyseChord(C, 'Db7')?.explanation).toBe(
      'Db7 is subV7 in C major: the tritone substitute for G7, a half step above C.',
    );
    expect(labels(C, 'Eb7')).toEqual(['subV7/ii']);
    expect(labels(C, 'Ab7')).toEqual(['subV7/V']);
    expect(labels(Am, 'Bb7')).toEqual(['subV7']);
  });

  it('lists every reading of an ambiguous chord, preferred first', () => {
    // A triad reads as borrowed first; a dominant 7th as a secondary dominant.
    expect(labels(Am, 'D')).toEqual(['IV', 'V/bVII']);
    expect(labels(Am, 'A')).toEqual(['I', 'V/iv']);
    expect(labels(Am, 'D7')).toEqual(['V7/bVII']);
    expect(labels(C, 'Bb7')).toEqual(['bVII7', 'subV7/vi']);
  });

  it('has no reading for chords it cannot explain', () => {
    expect(chordReadings(Am, 'Bb')).toEqual([]);
    expect(analyseChord(C, 'F#dim')).toBeNull();
    expect(functionOf(C, 'F#dim')).toBeNull();
    expect(functionOf(C, 'Bb')).toBe('dominant');
  });

  it('reads every secondary dominant, borrowed chord and tritone sub of every key', () => {
    for (const key of KEYS) {
      for (const sevenths of [false, true]) {
        for (const s of secondaryDominants(key, { sevenths })) {
          const readings = chordReadings(key, s.chord);
          // V/bIII in minor is the diatonic bVII; everything else is chromatic.
          const ok = readings[0]?.role === 'diatonic' || readings.some((r) => r.label === s.label);
          expect(ok, `${s.symbol} in ${key.tonic} ${key.mode}`).toBe(true);
        }
        for (const b of borrowedChords(key, { sevenths })) {
          expect(isBorrowed(key, b.chord), `${b.symbol} in ${key.tonic} ${key.mode}`).toBe(true);
          expect(isDiatonic(key, b.chord)).toBe(false);
        }
      }
      const dominantRoot = (diatonicChords(key)[4] as ChordSpec).root;
      const sub = tritoneSubstitute({ root: dominantRoot, quality: 'dominant7' });
      const subReading = chordReadings(key, sub).find((r) => r.role === 'tritone-substitute');
      expect(subReading?.label, `subV7 in ${key.tonic} ${key.mode}`).toBe('subV7');
    }
  });
});

describe('secondaryDominants', () => {
  it('lists V/ii … V/vi in a major key', () => {
    expect(symbols(secondaryDominants(C))).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(
      secondaryDominants(majorKey('Db'), { sevenths: true }).map((r) => `${r.symbol} ${r.label}`),
    ).toEqual(['Bb7 V7/ii', 'C7 V7/iii', 'Db7 V7/IV', 'Eb7 V7/V', 'F7 V7/vi']);
  });

  it('targets bIII, iv, V, bVI and bVII in a minor key', () => {
    expect(secondaryDominants(Am, { sevenths: true }).map((r) => r.label)).toEqual([
      'V7/bIII',
      'V7/iv',
      'V7/V',
      'V7/bVI',
      'V7/bVII',
    ]);
    expect(symbols(secondaryDominants(Am))).toEqual(['G', 'A', 'B', 'C', 'D']);
  });
});

describe('borrowedChords', () => {
  it('borrows from C minor in C major', () => {
    expect(symbols(borrowedChords(C))).toEqual(['Cm', 'Ddim', 'Eb', 'Fm', 'Gm', 'Ab', 'Bb']);
    expect(borrowedChords(C).map((b) => b.label)).toEqual([
      'i',
      'ii°',
      'bIII',
      'iv',
      'v',
      'bVI',
      'bVII',
    ]);
    expect(symbols(borrowedChords(C, { sevenths: true }))).toContain('Bb7');
  });

  it('borrows from the parallel major in a minor key, minus the harmonic V and vii°', () => {
    expect(symbols(borrowedChords(Am))).toEqual(['A', 'Bm', 'C#m', 'D', 'F#m']);
  });

  it('spots the borrowed chords in a progression', () => {
    expect(findBorrowed(C, ['C', 'Ab', 'Bb', 'C'])).toEqual([1, 2]);
    expect(findBorrowed(C, ['C', 'Fm', 'G7', 'C'])).toEqual([1]);
    expect(findBorrowed(Am, ['Am', 'D', 'E7', 'Am'])).toEqual([1]);
    expect(findBorrowed(C, [{ root: 'A', quality: 'minor' }])).toEqual([]);
  });
});

describe('tritoneSubstitute', () => {
  it('moves the dominant 7th a tritone, with plain spelling', () => {
    const sub = (s: string) => chordSymbol(tritoneSubstitute(s));
    expect(sub('G7')).toBe('Db7');
    expect(sub('D7')).toBe('Ab7');
    expect(sub('C7')).toBe('Gb7');
    expect(sub('F7')).toBe('B7');
    expect(sub('Bb7')).toBe('E7');
    expect(sub('Db7')).toBe('G7');
    expect(sub('Eb7')).toBe('A7');
  });

  it('shares the 3rd and 7th (as a tritone, swapped), for every root', () => {
    for (const root of CHROMATIC_ROOTS) {
      const dom: ChordSpec = { root, quality: 'dominant7' };
      const sub = tritoneSubstitute(dom);
      const [, third, , seventh] = chordTones(dom).map(chromaOf);
      const subTones = pcs(sub);
      expect(subTones.has(third as number) && subTones.has(seventh as number), root).toBe(true);
      expect(chromaOf(tritoneSubstitute(sub).root)).toBe(chromaOf(root));
    }
  });

  it('only accepts dominant 7ths', () => {
    expect(() => tritoneSubstitute('Cmaj7')).toThrow(RangeError);
  });
});

describe('relativeSubstitute', () => {
  it('swaps a chord for its relative', () => {
    const rel = (s: string) => {
      const r = relativeSubstitute(s);
      return r && chordSymbol(r);
    };
    expect(rel('C')).toBe('Am');
    expect(rel('Am')).toBe('C');
    expect(rel('F#m')).toBe('A');
    expect(rel('Eb')).toBe('Cm');
    expect(rel('G7')).toBe('Em7');
    expect(rel('Am7')).toBe('Cmaj7');
    expect(rel('Fmaj7')).toBe('Dm7');
    expect(rel('Bdim')).toBeNull();
  });

  it('shares two notes with the original triad, for every root', () => {
    for (const root of CHROMATIC_ROOTS) {
      for (const quality of ['major', 'minor'] as const) {
        const chord = { root, quality };
        const rel = relativeSubstitute(chord) as ChordSpec;
        const shared = [...pcs(chord)].filter((c) => pcs(rel).has(c));
        expect(shared, `${root} ${quality}`).toHaveLength(2);
      }
    }
  });
});

describe('substitutes', () => {
  const summary = (key: MusicalKey, chord: string) =>
    substitutes(key, chord).map((s) => `${s.kind} ${s.symbol} ${s.label}`);

  it('offers the relative, same-function, borrowed and tritone substitutes', () => {
    expect(summary(C, 'G7')).toEqual([
      'relative Em7 iii7',
      'same-function Bm7b5 viiø7',
      'borrowed Gm7 v7',
      'tritone Db7 bII7',
    ]);
    expect(summary(C, 'C')).toEqual(['relative Am vi', 'same-function Em iii', 'borrowed Cm i']);
    expect(summary(C, 'F')).toEqual(['relative Dm ii', 'borrowed Fm iv']);
    expect(summary(Am, 'Dm')).toEqual([
      'relative F bVI',
      'same-function Bdim ii°',
      'borrowed D IV',
    ]);
  });

  it('offers only the relative and tritone substitutes for a chromatic chord', () => {
    expect(summary(C, 'A7')).toEqual(['relative F#m7 #iv7', 'tritone Eb7 bIII7']);
    expect(summary(C, 'F#dim')).toEqual([]);
  });

  it('never offers the chord itself or a duplicate', () => {
    for (const key of KEYS) {
      for (const chord of diatonicChords(key, { sevenths: true })) {
        const subs = substitutes(key, chord);
        const keys = subs.map((s) => `${chromaOf(s.chord.root)} ${s.chord.quality}`);
        expect(new Set(keys).size).toBe(keys.length);
        expect(keys).not.toContain(`${chromaOf(chord.root)} ${chord.quality}`);
      }
    }
  });
});
