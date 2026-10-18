import { describe, expect, it } from 'vitest';
import { CHROMATIC_ROOTS } from '../test/fixtures';
import { chromaOf } from './fretboard';
import {
  CHORD_QUALITIES,
  CIRCLE_OF_FIFTHS,
  OPEN_SHAPE_KEYS,
  PROGRESSIONS,
  capoFret,
  capoOptions,
  chordFromNumeral,
  chordSymbol,
  chordTones,
  circleEntry,
  circlePosition,
  circleStep,
  diatonicChord,
  diatonicChords,
  dominantKey,
  getProgression,
  hasMinorThird,
  identifyProgression,
  isDiatonic,
  isRotationOf,
  isSeventh,
  keyLabel,
  keyName,
  keySignature,
  majorKey,
  matchProgression,
  minorKey,
  nashvilleNumber,
  nashvilleOf,
  nashvilleToRoman,
  numeralOf,
  parallelKey,
  parseChordSymbol,
  parseKey,
  parseNashville,
  parseRoman,
  progressionChords,
  relatedRotations,
  relativeKey,
  relativeMajor,
  relativeMinor,
  romanNumeral,
  romanOf,
  romanToNashville,
  rotate,
  rotationOffset,
  rotationsOf,
  sameChord,
  sameKey,
  scaleOf,
  semitonesUp,
  shapeChord,
  shapeKey,
  soundingChord,
  soundingKey,
  spellInKey,
  standardChordRoot,
  standardKeyTonic,
  subdominantKey,
  transposeChord,
  transposeChords,
  transposeKey,
  type MusicalKey,
} from './harmony';

const C = majorKey('C');
const symbols = (key: MusicalKey, sevenths = false) =>
  diatonicChords(key, { sevenths }).map((c) => c.symbol);

describe('keys', () => {
  it('parses labels and names', () => {
    expect(parseKey('Am')).toEqual(minorKey('A'));
    expect(parseKey('f#m')).toEqual(minorKey('F#'));
    expect(parseKey('Bb')).toEqual(majorKey('Bb'));
    expect(parseKey(' C major ')).toEqual(majorKey('C'));
    expect(parseKey('Eb minor')).toEqual(minorKey('Eb'));
    expect(parseKey('G min')).toEqual(minorKey('G'));
    expect(parseKey('D maj')).toEqual(majorKey('D'));
    expect(() => parseKey('H')).toThrow();
    expect(() => parseKey('C dorian')).toThrow();
    expect(keyLabel(minorKey('F#'))).toBe('F#m');
    expect(keyLabel(majorKey('D'))).toBe('D');
    expect(keyName(minorKey('A'))).toBe('A minor');
  });

  it('rejects invalid tonics', () => {
    expect(() => majorKey('X')).toThrow();
    expect(() => majorKey('C4')).toThrow();
  });

  it('compares keys enharmonically', () => {
    expect(sameKey(majorKey('F#'), majorKey('Gb'))).toBe(true);
    expect(sameKey(majorKey('C'), minorKey('C'))).toBe(false);
  });

  it('builds scales spelled by key', () => {
    expect(scaleOf(majorKey('D'))).toEqual(['D', 'E', 'F#', 'G', 'A', 'B', 'C#']);
    expect(scaleOf(majorKey('F'))).toEqual(['F', 'G', 'A', 'Bb', 'C', 'D', 'E']);
    expect(scaleOf(minorKey('A'))).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G']);
    expect(scaleOf(minorKey('C'))).toEqual(['C', 'D', 'Eb', 'F', 'G', 'Ab', 'Bb']);
  });

  it('spells chromatic notes in a key', () => {
    expect(spellInKey(chromaOf('F#'), majorKey('D'))).toBe('F#');
    expect(spellInKey(chromaOf('Bb'), C)).toBe('Bb');
    expect(spellInKey(chromaOf('Eb'), C)).toBe('Eb');
    expect(spellInKey(chromaOf('Ab'), C)).toBe('Ab');
    expect(spellInKey(chromaOf('F#'), C)).toBe('F#');
    expect(spellInKey(chromaOf('Bb'), majorKey('G'))).toBe('Bb');
    expect(spellInKey(chromaOf('E'), majorKey('F#'))).toBe('E');
    expect(spellInKey(chromaOf('A'), minorKey('C'))).toBe('A');
    // Double accidentals are simplified: the b2 of Db is D, not Ebb.
    expect(spellInKey(chromaOf('D'), majorKey('Db'))).toBe('D');
    // Theoretical keys keep their scale spelling for diatonic notes.
    expect(spellInKey(chromaOf('A'), minorKey('Db'))).toBe('Bbb');
  });
});

describe('chords', () => {
  it('writes and parses chord symbols for every quality', () => {
    for (const quality of CHORD_QUALITIES) {
      const chord = { root: 'F#', quality };
      expect(parseChordSymbol(chordSymbol(chord))).toEqual(chord);
    }
    expect(chordSymbol({ root: 'B', quality: 'half-diminished7' })).toBe('Bm7b5');
  });

  it('accepts common symbol aliases', () => {
    expect(parseChordSymbol('B°').quality).toBe('diminished');
    expect(parseChordSymbol('Bø').quality).toBe('half-diminished7');
    expect(parseChordSymbol('CM7').quality).toBe('major7');
    expect(parseChordSymbol('C-7').quality).toBe('minor7');
    expect(parseChordSymbol('C+').quality).toBe('augmented');
    expect(parseChordSymbol('Cmin').quality).toBe('minor');
    expect(() => parseChordSymbol('Csus4')).toThrow();
    expect(() => parseChordSymbol('Hm')).toThrow();
  });

  it('lists chord tones', () => {
    expect(chordTones('C')).toEqual(['C', 'E', 'G']);
    expect(chordTones('F#m')).toEqual(['F#', 'A', 'C#']);
    expect(chordTones('Bdim')).toEqual(['B', 'D', 'F']);
    expect(chordTones('Caug')).toEqual(['C', 'E', 'G#']);
    expect(chordTones('G7')).toEqual(['G', 'B', 'D', 'F']);
    expect(chordTones('Bm7b5')).toEqual(['B', 'D', 'F', 'A']);
    expect(chordTones({ root: 'B', quality: 'diminished7' })).toEqual(['B', 'D', 'F', 'Ab']);
  });

  it('classifies qualities', () => {
    expect(isSeventh('dominant7')).toBe(true);
    expect(isSeventh('minor')).toBe(false);
    expect(hasMinorThird('diminished')).toBe(true);
    expect(hasMinorThird('augmented')).toBe(false);
  });

  it('compares chords enharmonically', () => {
    expect(sameChord('A#m', 'Bbm')).toBe(true);
    expect(sameChord('C', 'Cm')).toBe(false);
  });
});

describe('diatonic harmony', () => {
  it('harmonises major keys', () => {
    expect(symbols(C)).toEqual(['C', 'Dm', 'Em', 'F', 'G', 'Am', 'Bdim']);
    expect(symbols(majorKey('D'))).toEqual(['D', 'Em', 'F#m', 'G', 'A', 'Bm', 'C#dim']);
    expect(symbols(majorKey('Bb'))).toEqual(['Bb', 'Cm', 'Dm', 'Eb', 'F', 'Gm', 'Adim']);
    expect(diatonicChords(C).map((c) => c.roman)).toEqual([
      'I',
      'ii',
      'iii',
      'IV',
      'V',
      'vi',
      'vii°',
    ]);
    expect(diatonicChords(C).map((c) => c.nashville)).toEqual([
      '1',
      '2m',
      '3m',
      '4',
      '5',
      '6m',
      '7°',
    ]);
  });

  it('harmonises natural minor keys with flat-degree numerals', () => {
    expect(symbols(minorKey('A'))).toEqual(['Am', 'Bdim', 'C', 'Dm', 'Em', 'F', 'G']);
    expect(diatonicChords(minorKey('A')).map((c) => c.roman)).toEqual([
      'i',
      'ii°',
      'bIII',
      'iv',
      'v',
      'bVI',
      'bVII',
    ]);
    expect(diatonicChords(minorKey('E')).map((c) => c.nashville)).toEqual([
      '1m',
      '2°',
      'b3',
      '4m',
      '5m',
      'b6',
      'b7',
    ]);
  });

  it('harmonises sevenths', () => {
    expect(symbols(C, true)).toEqual(['Cmaj7', 'Dm7', 'Em7', 'Fmaj7', 'G7', 'Am7', 'Bm7b5']);
    expect(diatonicChords(C, { sevenths: true }).map((c) => c.roman)).toEqual([
      'Imaj7',
      'ii7',
      'iii7',
      'IVmaj7',
      'V7',
      'vi7',
      'viiø7',
    ]);
    expect(symbols(minorKey('A'), true)).toEqual([
      'Am7',
      'Bm7b5',
      'Cmaj7',
      'Dm7',
      'Em7',
      'Fmaj7',
      'G7',
    ]);
  });

  it('gives every key the right qualities and degrees', () => {
    for (const root of CHROMATIC_ROOTS) {
      for (const key of [majorKey(root), minorKey(root)]) {
        const chords = diatonicChords(key);
        expect(chords.map((c) => c.degree)).toEqual([1, 2, 3, 4, 5, 6, 7]);
        expect(chords.map((c) => c.root)).toEqual(scaleOf(key));
        // Every chord's tones are in the key's scale.
        const scale = new Set(scaleOf(key).map(chromaOf));
        for (const c of chords) {
          expect(
            chordTones(c).every((t) => scale.has(chromaOf(t))),
            c.symbol,
          ).toBe(true);
          expect(chordFromNumeral(key, c.roman)).toEqual(c);
          expect(chordFromNumeral(key, c.nashville)).toEqual(c);
        }
      }
    }
  });

  it('looks up one degree', () => {
    expect(diatonicChord(majorKey('G'), 6).symbol).toBe('Em');
    expect(diatonicChord(majorKey('G'), 5, { sevenths: true }).symbol).toBe('D7');
  });

  it('tells diatonic from borrowed chords', () => {
    expect(isDiatonic(C, 'Am')).toBe(true);
    expect(isDiatonic(C, 'G7')).toBe(true);
    expect(isDiatonic(C, 'Bb')).toBe(false);
    expect(isDiatonic(C, 'A')).toBe(false);
    expect(isDiatonic(minorKey('A'), 'G')).toBe(true);
    // The harmonic-minor V (I4) is not natural-minor diatonic.
    expect(isDiatonic(minorKey('A'), 'E7')).toBe(false);
  });
});

describe('numerals', () => {
  it('names chords in a key, diatonic or borrowed', () => {
    expect(romanOf(C, 'Am')).toBe('vi');
    expect(romanOf(C, 'Bb')).toBe('bVII');
    expect(romanOf(C, 'Ab')).toBe('bVI');
    expect(romanOf(C, 'D7')).toBe('II7');
    expect(romanOf(C, 'F#dim')).toBe('#iv°');
    expect(romanOf(minorKey('A'), 'E7')).toBe('V7');
    expect(romanOf(majorKey('D'), 'Bm')).toBe('vi');
    expect(nashvilleOf(majorKey('D'), 'Bm')).toBe('6m');
    expect(nashvilleOf(C, 'Bb')).toBe('b7');
    // Spelling decides the numeral: A# in C is #VI.
    expect(romanOf(C, 'A#')).toBe('#VI');
    expect(romanOf(C, 'B#')).toBe('#VII');
    expect(romanOf(C, 'Fb')).toBe('bIV');
    expect(numeralOf(C, 'Cbb')).toEqual({ degree: 1, alteration: -2, quality: 'major' });
  });

  it('round-trips every numeral through text', () => {
    for (const quality of CHORD_QUALITIES) {
      for (const alteration of [-1, 0, 1]) {
        for (const degree of [1, 2, 3, 4, 5, 6, 7] as const) {
          const n = { degree, alteration, quality };
          expect(parseRoman(romanNumeral(n))).toEqual(n);
          expect(parseNashville(nashvilleNumber(n))).toEqual(n);
        }
      }
    }
  });

  it('accepts o for ° and ø for ø7', () => {
    expect(parseRoman('viio')?.quality).toBe('diminished');
    expect(parseRoman('viio7')?.quality).toBe('diminished7');
    expect(parseRoman('viiø')?.quality).toBe('half-diminished7');
    expect(parseNashville('7o')?.quality).toBe('diminished');
    expect(parseNashville('7ø')?.quality).toBe('half-diminished7');
    expect(parseRoman('bbVII')?.alteration).toBe(-2);
    expect(parseNashville('##4')?.alteration).toBe(2);
  });

  it('rejects malformed numerals', () => {
    for (const bad of ['I°', 'vi+', 'vimaj7', 'Vm', 'VIII', 'x', '', 'iV']) {
      expect(parseRoman(bad), bad).toBeNull();
    }
    for (const bad of ['8', '0', '6x', 'm6']) expect(parseNashville(bad), bad).toBeNull();
    expect(() => chordFromNumeral(C, 'nope')).toThrow();
  });

  it('converts between Roman and Nashville', () => {
    expect(romanToNashville('vi')).toBe('6m');
    expect(romanToNashville('bVII')).toBe('b7');
    expect(romanToNashville('vii°')).toBe('7°');
    expect(romanToNashville('ii7')).toBe('2m7');
    expect(nashvilleToRoman('6m')).toBe('vi');
    expect(nashvilleToRoman('b6')).toBe('bVI');
    expect(nashvilleToRoman('5maj7')).toBe('Vmaj7');
    expect(() => romanToNashville('6m')).toThrow();
    expect(() => nashvilleToRoman('vi')).toThrow();
  });

  it('realises numerals in keys', () => {
    expect(chordFromNumeral(C, 'bVII').symbol).toBe('Bb');
    expect(chordFromNumeral(majorKey('G'), 'bVII').symbol).toBe('F');
    expect(chordFromNumeral(majorKey('E'), 'bVI').symbol).toBe('C');
    expect(chordFromNumeral(majorKey('G'), 'bIII').symbol).toBe('Bb');
    expect(chordFromNumeral(C, '#iv°').symbol).toBe('F#dim');
    expect(chordFromNumeral(C, 'bbVII').symbol).toBe('A');
    expect(chordFromNumeral(C, '##IV').symbol).toBe('G');
    expect(chordFromNumeral(minorKey('A'), 'V7').symbol).toBe('E7');
    expect(chordFromNumeral(majorKey('D'), '6m').symbol).toBe('Bm');
    expect(chordFromNumeral(C, { degree: 5, alteration: 0, quality: 'dominant7' }).roman).toBe(
      'V7',
    );
  });
});

describe('progressions', () => {
  it('covers the research/03 C9 catalogue', () => {
    expect(PROGRESSIONS.map((p) => p.id)).toEqual([
      'I-IV-V',
      'I-V-vi-IV',
      'vi-IV-I-V',
      'I-vi-IV-V',
      'ii-V-I',
      '12-bar-blues',
      '12-bar-blues-quick-change',
      'i-bVII-bVI-bVII',
    ]);
    for (const p of PROGRESSIONS) {
      expect(
        p.numerals.every((n) => parseRoman(n) !== null),
        p.id,
      ).toBe(true);
    }
    expect(new Set(PROGRESSIONS.map((p) => p.id)).size).toBe(PROGRESSIONS.length);
  });

  it('has 12-bar blues forms that differ only in bar 2', () => {
    const slow = getProgression('12-bar-blues').numerals;
    const quick = getProgression('12-bar-blues-quick-change').numerals;
    expect(slow).toHaveLength(12);
    expect(quick).toHaveLength(12);
    expect(slow.map((n, i) => (n === quick[i] ? '' : i))).toEqual([
      '',
      1,
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
    ]);
    expect(quick[1]).toBe('IV7');
    expect(() => getProgression('nope')).toThrow();
  });

  it('realises progressions in a key', () => {
    const chords = (id: string, key: MusicalKey) =>
      progressionChords(key, getProgression(id)).map((c) => c.symbol);
    expect(chords('I-V-vi-IV', C)).toEqual(['C', 'G', 'Am', 'F']);
    expect(chords('I-V-vi-IV', majorKey('D'))).toEqual(['D', 'A', 'Bm', 'G']);
    expect(chords('i-bVII-bVI-bVII', minorKey('A'))).toEqual(['Am', 'G', 'F', 'G']);
    expect(chords('i-bVII-bVI-bVII', minorKey('C#'))).toEqual(['C#m', 'B', 'A', 'B']);
    expect(chords('12-bar-blues', majorKey('E')).slice(0, 5)).toEqual([
      'E7',
      'E7',
      'E7',
      'E7',
      'A7',
    ]);
    expect(progressionChords(C, ['ii', 'V', 'I']).map((c) => c.symbol)).toEqual(['Dm', 'G', 'C']);
  });

  it('rotates sequences', () => {
    expect(rotate(['I', 'V', 'vi', 'IV'], 2)).toEqual(['vi', 'IV', 'I', 'V']);
    expect(rotate(['I', 'V', 'vi', 'IV'], -1)).toEqual(['IV', 'I', 'V', 'vi']);
    expect(rotate([], 3)).toEqual([]);
    expect(rotationsOf(['I', 'V', 'vi', 'IV'])).toHaveLength(4);
    expect(rotationsOf(['I', 'IV', 'I', 'IV'])).toEqual([
      ['I', 'IV', 'I', 'IV'],
      ['IV', 'I', 'IV', 'I'],
    ]);
    expect(rotationOffset(['I', 'V', 'vi', 'IV'], ['vi', 'IV', 'I', 'V'])).toBe(2);
    expect(rotationOffset(['I'], ['I', 'V'])).toBeNull();
    expect(rotationOffset([], [])).toBe(0);
    expect(rotationOffset(['I', 'V'], ['I', 'IV'])).toBeNull();
    expect(isRotationOf(['I', 'vi', 'IV', 'V'], ['vi', 'IV', 'V', 'I'])).toBe(true);
  });

  it('links I–V–vi–IV and vi–IV–I–V as rotations (the C9 misconception)', () => {
    expect(relatedRotations('I-V-vi-IV').map((p) => p.id)).toEqual(['vi-IV-I-V']);
    expect(relatedRotations(getProgression('vi-IV-I-V')).map((p) => p.id)).toEqual(['I-V-vi-IV']);
    expect(relatedRotations('I-vi-IV-V')).toEqual([]);
  });

  it('matches numeral sequences, exact first', () => {
    const m = matchProgression(['vi', 'IV', 'I', 'V']);
    expect(m.map((x) => [x.progression.id, x.rotation])).toEqual([
      ['vi-IV-I-V', 0],
      ['I-V-vi-IV', 2],
    ]);
    expect(matchProgression(['6m', '4', '1', '5'])).toEqual(m);
    expect(matchProgression(['IV', 'V', 'I'])[0]).toEqual({
      progression: getProgression('I-IV-V'),
      rotation: 1,
    });
    expect(matchProgression(['I', 'ii'])).toEqual([]);
  });

  it('identifies a chord chart in a key', () => {
    expect(identifyProgression(majorKey('G'), ['G', 'D', 'Em', 'C'])[0]?.progression.id).toBe(
      'I-V-vi-IV',
    );
    expect(identifyProgression(minorKey('E'), ['Em', 'D', 'C', 'D'])[0]?.progression.id).toBe(
      'i-bVII-bVI-bVII',
    );
    expect(identifyProgression(C, ['C', 'E', 'F'])).toEqual([]);
  });
});

describe('transposition', () => {
  it('counts semitones up', () => {
    expect(semitonesUp('G', 'Bb')).toBe(3);
    expect(semitonesUp('Bb', 'G')).toBe(9);
    expect(semitonesUp(majorKey('C'), majorKey('C'))).toBe(0);
  });

  it('transposes keys with standard spelling', () => {
    expect(transposeKey(majorKey('G'), 3)).toEqual(majorKey('Bb'));
    expect(transposeKey(majorKey('A'), 1)).toEqual(majorKey('Bb'));
    expect(transposeKey(majorKey('C'), -1)).toEqual(majorKey('B'));
    expect(transposeKey(minorKey('A'), 1)).toEqual(minorKey('Bb'));
    expect(transposeKey(minorKey('A'), 4)).toEqual(minorKey('C#'));
  });

  it('transposes single chords', () => {
    expect(transposeChord('Am', 2)).toEqual({ root: 'B', quality: 'minor' });
    expect(transposeChord('A', 1)).toEqual({ root: 'Bb', quality: 'major' });
    expect(transposeChord('Am', 1)).toEqual({ root: 'Bb', quality: 'minor' });
    expect(transposeChord('Bm', 2)).toEqual({ root: 'C#', quality: 'minor' });
    expect(transposeChord('B', 2)).toEqual({ root: 'Db', quality: 'major' });
    expect(transposeChord('A', 1, 'sharp')).toEqual({ root: 'A#', quality: 'major' });
    expect(transposeChord('A', 1, 'flat')).toEqual({ root: 'Bb', quality: 'major' });
    expect(transposeChord('C7', 6, majorKey('C'))).toEqual({ root: 'F#', quality: 'dominant7' });
    expect(chordSymbol(transposeChord('G', 3, majorKey('Eb')))).toBe('Bb');
  });

  it('transposes charts by function, spelled in the new key', () => {
    const syms = (cs: readonly { symbol: string }[]) => cs.map((c) => c.symbol);
    expect(syms(transposeChords(['C', 'G', 'Am', 'F'], C, majorKey('D')))).toEqual([
      'D',
      'A',
      'Bm',
      'G',
    ]);
    expect(syms(transposeChords(['C', 'Bb', 'F'], C, majorKey('E')))).toEqual(['E', 'D', 'A']);
    expect(syms(transposeChords(['Am', 'G', 'F'], minorKey('A'), minorKey('F#')))).toEqual([
      'F#m',
      'E',
      'D',
    ]);
    // Down a whole step: transposition direction matters (C10 misconception).
    expect(syms(transposeChords(['D', 'G'], majorKey('D'), majorKey('C')))).toEqual(['C', 'F']);
  });
});

describe('capo', () => {
  it('answers "song in Bb, G shapes: which capo fret?"', () => {
    expect(capoFret(majorKey('Bb'), majorKey('G'))).toBe(3);
    expect(capoFret('Bb', 'G')).toBe(3);
    expect(capoFret('G', 'G')).toBe(0);
    expect(capoFret('F', 'G')).toBe(10);
  });

  it('converts between shape and sounding keys', () => {
    expect(soundingKey(majorKey('G'), 3)).toEqual(majorKey('Bb'));
    expect(soundingKey(minorKey('E'), 2)).toEqual(minorKey('F#'));
    expect(shapeKey(majorKey('Bb'), 3)).toEqual(majorKey('G'));
    expect(shapeKey(majorKey('Eb'), 1)).toEqual(majorKey('D'));
    for (const shape of OPEN_SHAPE_KEYS) {
      for (let capo = 0; capo <= 11; capo++) {
        expect(sameKey(shapeKey(soundingKey(shape, capo), capo), shape)).toBe(true);
      }
    }
    expect(() => soundingKey(C, -1)).toThrow(RangeError);
    expect(() => shapeKey(C, 1.5)).toThrow(RangeError);
    expect(() => soundingKey(C, 30)).toThrow(RangeError);
  });

  it('converts between shape and sounding chords', () => {
    expect(chordSymbol(soundingChord('G', 3))).toBe('Bb');
    expect(chordSymbol(soundingChord('Em', 2))).toBe('F#m');
    expect(chordSymbol(soundingChord('C', 1, majorKey('C#')))).toBe('C#');
    expect(chordSymbol(shapeChord('Bb', 3))).toBe('G');
    expect(chordSymbol(shapeChord('F#m', 2))).toBe('Em');
    expect(chordSymbol(shapeChord('Bb', 1, majorKey('A')))).toBe('A');
    expect(() => soundingChord('G', -2)).toThrow(RangeError);
    expect(() => shapeChord('G', -2)).toThrow(RangeError);
  });

  it('lists open-shape capo options, lowest capo first', () => {
    const opts = capoOptions(majorKey('Bb'));
    expect(opts.map((o) => [keyLabel(o.shape), o.capo])).toEqual([
      ['A', 1],
      ['G', 3],
      ['E', 6],
    ]);
    expect(capoOptions(minorKey('F#')).map((o) => [keyLabel(o.shape), o.capo])).toEqual([
      ['Em', 2],
      ['Dm', 4],
    ]);
    expect(capoOptions(majorKey('Bb'), { maxCapo: 2 })).toHaveLength(1);
    expect(capoOptions(majorKey('D'), { shapes: [majorKey('D')] })).toEqual([
      { shape: majorKey('D'), capo: 0 },
    ]);
  });
});

describe('circle of fifths', () => {
  it('lists twelve keys a fifth apart with relative minors', () => {
    expect(CIRCLE_OF_FIFTHS).toHaveLength(12);
    CIRCLE_OF_FIFTHS.forEach((e, i) => {
      expect(e.position).toBe(i);
      const next = CIRCLE_OF_FIFTHS[(i + 1) % 12]!;
      expect(semitonesUp(e.major, next.major)).toBe(7);
      expect(semitonesUp(e.minor, e.major)).toBe(3);
      expect(keySignature(majorKey(e.major)).alteration).toBe(e.alteration);
      expect(keySignature(minorKey(e.minor)).alteration).toBe(e.alteration);
      if (e.enharmonic) {
        expect(chromaOf(e.enharmonic.major)).toBe(chromaOf(e.major));
        expect(keySignature(majorKey(e.enharmonic.major)).alteration).toBe(e.enharmonic.alteration);
      }
    });
  });

  it('places keys on the circle', () => {
    expect(circlePosition(C)).toBe(0);
    expect(circlePosition(minorKey('A'))).toBe(0);
    expect(circlePosition(majorKey('Gb'))).toBe(6);
    expect(circlePosition(majorKey('F#'))).toBe(6);
    expect(circlePosition(minorKey('D'))).toBe(11);
    expect(circleEntry(majorKey('Eb')).minor).toBe('C');
  });

  it('steps around the circle', () => {
    expect(circleStep(C, 1)).toEqual(majorKey('G'));
    expect(circleStep(C, -1)).toEqual(majorKey('F'));
    expect(circleStep(C, 6)).toEqual(majorKey('F#'));
    expect(circleStep(minorKey('A'), 2)).toEqual(minorKey('B'));
    expect(circleStep(majorKey('F'), 13)).toEqual(C);
  });

  it('names standard tonics by chroma', () => {
    expect(CHROMATIC_ROOTS.map((r) => standardKeyTonic(chromaOf(r), 'major'))).toEqual([
      'C',
      'Db',
      'D',
      'Eb',
      'E',
      'F',
      'F#',
      'G',
      'Ab',
      'A',
      'Bb',
      'B',
    ]);
    expect(CHROMATIC_ROOTS.map((r) => standardKeyTonic(chromaOf(r), 'minor'))).toEqual([
      'C',
      'C#',
      'D',
      'D#',
      'E',
      'F',
      'F#',
      'G',
      'G#',
      'A',
      'Bb',
      'B',
    ]);
  });

  it('spells chord roots the usual chart way', () => {
    expect(standardChordRoot(chromaOf('A#'), 'major')).toBe('Bb');
    expect(standardChordRoot(chromaOf('Db'), 'minor')).toBe('C#');
    expect(standardChordRoot(chromaOf('G#'), 'dominant7')).toBe('Ab');
    expect(standardChordRoot(chromaOf('G#'), 'minor7')).toBe('G#');
  });

  it('gives related keys', () => {
    expect(dominantKey(C)).toEqual(majorKey('G'));
    expect(dominantKey(minorKey('A'))).toEqual(minorKey('E'));
    expect(subdominantKey(C)).toEqual(majorKey('F'));
    expect(subdominantKey(majorKey('F'))).toEqual(majorKey('Bb'));
    expect(relativeKey(C)).toEqual(minorKey('A'));
    expect(relativeKey(minorKey('E'))).toEqual(majorKey('G'));
    expect(relativeMinor('F#')).toBe('D#');
    expect(relativeMinor('Eb')).toBe('C');
    expect(relativeMajor('B')).toBe('D');
    expect(parallelKey(C)).toEqual(minorKey('C'));
    expect(parallelKey(minorKey('C'))).toEqual(C);
  });

  it('builds key signatures', () => {
    expect(keySignature(C)).toEqual({ alteration: 0, sharps: 0, flats: 0, accidentals: [] });
    expect(keySignature(majorKey('D'))).toEqual({
      alteration: 2,
      sharps: 2,
      flats: 0,
      accidentals: ['F#', 'C#'],
    });
    expect(keySignature(majorKey('F')).accidentals).toEqual(['Bb']);
    expect(keySignature(minorKey('C')).accidentals).toEqual(['Bb', 'Eb', 'Ab']);
    expect(keySignature(majorKey('Gb')).flats).toBe(6);
    expect(keySignature(majorKey('C#')).accidentals).toEqual([
      'F#',
      'C#',
      'G#',
      'D#',
      'A#',
      'E#',
      'B#',
    ]);
    // Theoretical key: G# major needs F##.
    expect(keySignature(majorKey('G#')).accidentals[0]).toBe('F##');
    expect(keySignature(majorKey('G#')).alteration).toBe(8);
  });

  it('agrees with the accidentals in each key’s scale', () => {
    for (const e of CIRCLE_OF_FIFTHS) {
      const key = majorKey(e.major);
      const altered = scaleOf(key).filter((n) => n.length > 1);
      expect(new Set(keySignature(key).accidentals)).toEqual(new Set(altered));
    }
  });
});
