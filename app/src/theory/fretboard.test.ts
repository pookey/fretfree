import { describe, expect, it } from 'vitest';
import {
  DROP_D_TUNING,
  MAX_FRET,
  NATURAL_PCS,
  STANDARD_TUNING,
  allStrings,
  cellLabel,
  chromaOf,
  chromaToPc,
  crossesGBShift,
  inRange,
  isNatural,
  midiAt,
  midiToFretNote,
  noteAt,
  octaveShapeUp,
  octavesOf,
  openStringMidi,
  positionsOfMidi,
  positionsOfPitchClass,
  samePitchClass,
  samePosition,
  stringCount,
} from './fretboard';

const OPEN = { 6: 'E', 5: 'A', 4: 'D', 3: 'G', 2: 'B', 1: 'E' } as const;
const CHROMATIC = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

describe('open strings', () => {
  it('maps standard tuning string numbers to the right MIDI notes', () => {
    expect([1, 2, 3, 4, 5, 6].map((s) => openStringMidi(s))).toEqual([64, 59, 55, 50, 45, 40]);
  });

  it('supports alternate tunings', () => {
    expect(openStringMidi(6, DROP_D_TUNING)).toBe(38);
    expect(noteAt({ string: 6, fret: 0 }, DROP_D_TUNING).pc).toBe('D');
  });

  it('rejects strings and frets outside the instrument', () => {
    expect(() => openStringMidi(0)).toThrow(RangeError);
    expect(() => openStringMidi(7)).toThrow(RangeError);
    expect(() => midiAt({ string: 1, fret: -1 })).toThrow(RangeError);
    expect(() => midiAt({ string: 1, fret: MAX_FRET + 1 })).toThrow(RangeError);
    expect(() => midiAt({ string: 1, fret: 1.5 })).toThrow(RangeError);
  });

  it('rejects malformed tunings', () => {
    expect(() => openStringMidi(1, { id: 'x', name: 'x', notes: ['nope'] })).toThrow(
      /Invalid tuning/,
    );
  });

  it('lists strings high to low', () => {
    expect(allStrings()).toEqual([1, 2, 3, 4, 5, 6]);
    expect(stringCount()).toBe(6);
  });
});

describe('noteAt — exhaustive over every string and fret', () => {
  for (const string of [1, 2, 3, 4, 5, 6] as const) {
    it(`string ${string}, frets 0–${MAX_FRET}`, () => {
      const openIdx = CHROMATIC.indexOf(OPEN[string]);
      for (let fret = 0; fret <= MAX_FRET; fret++) {
        const n = noteAt({ string, fret });
        expect(n.pc).toBe(CHROMATIC[(openIdx + fret) % 12]);
        expect(n.chroma).toBe((openIdx + fret) % 12);
        expect(n.midi).toBe(openStringMidi(string) + fret);
      }
    });
  }

  it('repeats every 12 frets one octave higher (topic F3)', () => {
    for (const string of allStrings()) {
      for (let fret = 0; fret <= 12; fret++) {
        const a = noteAt({ string, fret });
        const b = noteAt({ string, fret: fret + 12 });
        expect(b.pc).toBe(a.pc);
        expect(b.midi - a.midi).toBe(12);
      }
    }
  });

  it('matches the fifth-fret tuning rule, including the G–B major 3rd', () => {
    for (let string = 6; string >= 2; string--) {
      const fret = string === 3 ? 4 : 5;
      expect(midiAt({ string, fret })).toBe(openStringMidi(string - 1));
    }
  });

  it('spells accidentals by preference', () => {
    expect(noteAt({ string: 6, fret: 2 }, STANDARD_TUNING, 'sharp').pc).toBe('F#');
    expect(noteAt({ string: 6, fret: 2 }, STANDARD_TUNING, 'flat').pc).toBe('Gb');
    expect(noteAt({ string: 6, fret: 2 }).name).toBe('F#2');
    expect(noteAt({ string: 1, fret: 8 }).name).toBe('C5');
  });

  it('knows common landmarks', () => {
    expect(noteAt({ string: 6, fret: 5 }).pc).toBe('A');
    expect(noteAt({ string: 5, fret: 7 }).pc).toBe('E');
    expect(noteAt({ string: 6, fret: 8 }).pc).toBe('C');
    expect(noteAt({ string: 5, fret: 3 }).pc).toBe('C');
    expect(noteAt({ string: 3, fret: 4 }).pc).toBe('B');
  });
});

describe('pitch-class helpers', () => {
  it('converts chroma both ways and wraps negatives', () => {
    for (let c = 0; c < 12; c++) {
      expect(chromaOf(chromaToPc(c, 'sharp'))).toBe(c);
      expect(chromaOf(chromaToPc(c, 'flat'))).toBe(c);
    }
    expect(chromaToPc(-1)).toBe('B');
    expect(chromaToPc(13, 'flat')).toBe('Db');
  });

  it('treats enharmonics as the same pitch class', () => {
    expect(samePitchClass('C#', 'Db')).toBe(true);
    expect(samePitchClass('E#', 'F')).toBe(true);
    expect(samePitchClass('E', 'F')).toBe(false);
  });

  it('throws on invalid notes', () => {
    expect(() => chromaOf('H')).toThrow(/Invalid note/);
  });

  it('identifies naturals', () => {
    for (const pc of NATURAL_PCS) expect(isNatural(pc)).toBe(true);
    expect(isNatural('F#')).toBe(false);
    expect(isNatural('Bb')).toBe(false);
    expect(isNatural('zz')).toBe(false);
  });

  it('builds fret notes from MIDI including low octaves', () => {
    expect(midiToFretNote(60)).toEqual({ pc: 'C', name: 'C4', midi: 60, chroma: 0 });
    expect(midiToFretNote(61, 'flat').name).toBe('Db4');
  });
});

describe('positionsOfPitchClass (name → positions)', () => {
  it('finds exactly one position per string per octave for every pitch class', () => {
    for (const pc of CHROMATIC) {
      const found = positionsOfPitchClass(pc, { fretRange: { from: 0, to: 11 } });
      expect(found).toHaveLength(6);
      for (const pos of found) expect(noteAt(pos).pc).toBe(pc);
    }
  });

  it('respects string and fret filters', () => {
    const gs = positionsOfPitchClass('G', { strings: [6, 5], fretRange: { from: 0, to: 12 } });
    expect(gs).toEqual([
      { string: 6, fret: 3 },
      { string: 5, fret: 10 },
    ]);
  });

  it('accepts flats and finds open strings and the 12th fret', () => {
    const es = positionsOfPitchClass('Fb', { strings: [1] });
    expect(es).toEqual([
      { string: 1, fret: 0 },
      { string: 1, fret: 12 },
    ]);
  });

  it('defaults to the 0–12 window', () => {
    expect(positionsOfPitchClass('E')).toHaveLength(8);
  });
});

describe('positionsOfMidi (unisons)', () => {
  it('finds every position that sounds E4', () => {
    expect(positionsOfMidi(64, { fretRange: { from: 0, to: 24 } })).toEqual([
      { string: 1, fret: 0 },
      { string: 2, fret: 5 },
      { string: 3, fret: 9 },
      { string: 4, fret: 14 },
      { string: 5, fret: 19 },
      { string: 6, fret: 24 },
    ]);
  });
});

describe('octaves (topic C1)', () => {
  it('finds all octaves of a position within the window', () => {
    const octs = octavesOf({ string: 6, fret: 3 }, { fretRange: { from: 0, to: 12 } });
    expect(octs.every((p) => noteAt(p).pc === 'G')).toBe(true);
    expect(octs).not.toContainEqual({ string: 6, fret: 3 });
    expect(octs).toContainEqual({ string: 4, fret: 5 });
    expect(octs).toContainEqual({ string: 1, fret: 3 });
  });

  it('excludes unisons', () => {
    const octs = octavesOf({ string: 1, fret: 0 }, { fretRange: { from: 0, to: 24 } });
    expect(octs).not.toContainEqual({ string: 2, fret: 5 });
  });

  it('applies the G–B shift to octave shapes', () => {
    expect(octaveShapeUp({ string: 6, fret: 5 })).toEqual({ string: 4, fret: 7 });
    expect(octaveShapeUp({ string: 5, fret: 3 })).toEqual({ string: 3, fret: 5 });
    expect(octaveShapeUp({ string: 4, fret: 2 })).toEqual({ string: 2, fret: 5 });
    expect(octaveShapeUp({ string: 3, fret: 2 })).toEqual({ string: 1, fret: 5 });
    expect(octaveShapeUp({ string: 2, fret: 1 })).toBeNull();
    expect(octaveShapeUp({ string: 4, fret: 23 })).toBeNull();
  });

  it('detects crossings of the G–B pair', () => {
    expect(crossesGBShift(3, 2)).toBe(true);
    expect(crossesGBShift(4, 2)).toBe(true);
    expect(crossesGBShift(2, 5)).toBe(true);
    expect(crossesGBShift(6, 4)).toBe(false);
    expect(crossesGBShift(2, 1)).toBe(false);
  });
});

describe('misc helpers', () => {
  it('compares positions and ranges', () => {
    expect(samePosition({ string: 1, fret: 2 }, { string: 1, fret: 2 })).toBe(true);
    expect(samePosition({ string: 1, fret: 2 }, { string: 2, fret: 2 })).toBe(false);
    expect(inRange(5, { from: 0, to: 5 })).toBe(true);
    expect(inRange(6, { from: 0, to: 5 })).toBe(false);
  });

  it('builds accessible cell labels, hiding the note unless revealed', () => {
    expect(cellLabel({ string: 5, fret: 7 })).toBe('string 5, fret 7');
    expect(cellLabel({ string: 5, fret: 7 }, { revealNote: true })).toBe('string 5, fret 7, E');
  });
});
