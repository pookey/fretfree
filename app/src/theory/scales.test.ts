import { describe, expect, it } from 'vitest';
import { Interval, Note } from 'tonal';
import { CHROMATIC_ROOTS } from '../test/fixtures';
import { chromaOf } from './fretboard';
import {
  COMMON_MAJOR_KEY_TONICS,
  DEGREE_NAMES,
  MAJOR_DEGREE_INTERVALS,
  MAJOR_KEY_TONICS,
  MAJOR_SCALE_STEPS,
  SCALE_DEGREES,
  chromaticDegree,
  compareSpelling,
  compareSpellings,
  degreeName,
  degreeOfNote,
  degreeOfPitch,
  degreeOrdinal,
  isPracticalMajorKey,
  majorKeySpelling,
  majorScale,
  scaleDegreeNote,
  usesEachLetterOnce,
} from './scales';

const ALL_SPELLED_TONICS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'].flatMap((l) => [
  l,
  `${l}#`,
  `${l}b`,
]);

describe('majorScale', () => {
  it('spells the familiar keys', () => {
    expect(majorScale('C')).toEqual(['C', 'D', 'E', 'F', 'G', 'A', 'B']);
    expect(majorScale('D')).toEqual(['D', 'E', 'F#', 'G', 'A', 'B', 'C#']);
    expect(majorScale('Eb')).toEqual(['Eb', 'F', 'G', 'Ab', 'Bb', 'C', 'D']);
    expect(majorScale('F#')).toEqual(['F#', 'G#', 'A#', 'B', 'C#', 'D#', 'E#']);
    expect(majorScale('Gb')).toEqual(['Gb', 'Ab', 'Bb', 'Cb', 'Db', 'Eb', 'F']);
    expect(majorScale('Cb')).toEqual(['Cb', 'Db', 'Eb', 'Fb', 'Gb', 'Ab', 'Bb']);
  });

  it('builds every spelled tonic from W W H W W W H with each letter once', () => {
    for (const tonic of ALL_SPELLED_TONICS) {
      const notes = majorScale(tonic);
      expect(notes, tonic).toHaveLength(7);
      expect(notes[0]).toBe(tonic);
      expect(usesEachLetterOnce(notes), tonic).toBe(true);
      const ring = [...notes, tonic];
      const steps = notes.map((n, i) => {
        const semis = (((chromaOf(ring[i + 1] as string) - chromaOf(n)) % 12) + 12) % 12;
        return semis === 2 ? 'W' : semis === 1 ? 'H' : '?';
      });
      expect(steps, tonic).toEqual(MAJOR_SCALE_STEPS);
      notes.forEach((n, i) => {
        expect(Note.get(Note.transpose(tonic, MAJOR_DEGREE_INTERVALS[i] as string)).pc).toBe(n);
      });
    }
  });

  it('rejects invalid tonics and notes with octaves', () => {
    expect(() => majorScale('H')).toThrow();
    expect(() => majorScale('C4')).toThrow();
    expect(() => majorScale('')).toThrow();
  });
});

describe('key lists', () => {
  it('lists the 15 practical major keys', () => {
    expect(MAJOR_KEY_TONICS).toHaveLength(15);
    expect(new Set(MAJOR_KEY_TONICS).size).toBe(15);
    for (const t of MAJOR_KEY_TONICS) {
      expect(isPracticalMajorKey(t), t).toBe(true);
      expect(
        majorScale(t).some((n) => /##|bb/.test(n)),
        t,
      ).toBe(false);
    }
  });

  it('flags theoretical keys that need double accidentals', () => {
    for (const t of ALL_SPELLED_TONICS.filter((x) => !MAJOR_KEY_TONICS.includes(x))) {
      expect(isPracticalMajorKey(t), t).toBe(false);
      expect(
        majorScale(t).some((n) => /##|bb/.test(n)),
        t,
      ).toBe(true);
    }
  });

  it('gives one common spelling per pitch class', () => {
    expect(new Set(COMMON_MAJOR_KEY_TONICS.map(chromaOf)).size).toBe(12);
    for (const t of COMMON_MAJOR_KEY_TONICS) expect(isPracticalMajorKey(t)).toBe(true);
  });
});

describe('degrees', () => {
  it('answers "the 6th of Eb" and friends', () => {
    expect(scaleDegreeNote('Eb', 6)).toBe('C');
    expect(scaleDegreeNote('A', 3)).toBe('C#');
    expect(scaleDegreeNote('F', 4)).toBe('Bb');
    expect(scaleDegreeNote('B', 7)).toBe('A#');
  });

  it('round-trips degree ↔ note for every key and degree', () => {
    for (const tonic of ALL_SPELLED_TONICS) {
      for (const d of SCALE_DEGREES) {
        const note = scaleDegreeNote(tonic, d);
        expect(degreeOfNote(tonic, note)).toBe(d);
        expect(degreeOfPitch(tonic, note)).toBe(d);
        const semis = Interval.semitones(MAJOR_DEGREE_INTERVALS[d - 1] as string);
        expect(chromaticDegree(tonic, note)).toBe(['1', '2', '3', '4', '5', '6', '7'][d - 1]);
        expect((((chromaOf(note) - chromaOf(tonic)) % 12) + 12) % 12).toBe(semis);
      }
    }
  });

  it('is spelling-strict in degreeOfNote but not in degreeOfPitch', () => {
    expect(degreeOfNote('F#', 'E#')).toBe(7);
    expect(degreeOfNote('F#', 'F')).toBeNull();
    expect(degreeOfPitch('F#', 'F')).toBe(7);
    expect(degreeOfNote('C', 'C4')).toBe(1);
    expect(degreeOfNote('C', 'F#')).toBeNull();
    expect(degreeOfPitch('C', 'F#')).toBeNull();
  });

  it('labels all twelve chromatic degrees', () => {
    const labels = CHROMATIC_ROOTS.map((n) => chromaticDegree('C', n));
    expect(labels).toEqual(['1', 'b2', '2', 'b3', '3', '4', 'b5', '5', 'b6', '6', 'b7', '7']);
    expect(chromaticDegree('E', 'D')).toBe('b7');
    expect(chromaticDegree('A', 'C')).toBe('b3');
  });

  it('names and ordinals each degree', () => {
    expect(SCALE_DEGREES.map(degreeName)).toEqual(DEGREE_NAMES);
    expect(degreeName(5)).toBe('dominant');
    expect(SCALE_DEGREES.map(degreeOrdinal)).toEqual([
      '1st',
      '2nd',
      '3rd',
      '4th',
      '5th',
      '6th',
      '7th',
    ]);
  });

  it('rejects degrees outside 1–7', () => {
    for (const bad of [0, 8, 2.5, -1]) {
      expect(() => scaleDegreeNote('C', bad)).toThrow(RangeError);
      expect(() => degreeName(bad)).toThrow(RangeError);
      expect(() => degreeOrdinal(bad)).toThrow(RangeError);
    }
  });
});

describe('majorKeySpelling', () => {
  it('explains D and Bb', () => {
    expect(majorKeySpelling('D')).toEqual({
      tonic: 'D',
      notes: ['D', 'E', 'F#', 'G', 'A', 'B', 'C#'],
      alteration: 2,
      accidentals: ['F#', 'C#'],
    });
    expect(majorKeySpelling('Bb').accidentals).toEqual(['Bb', 'Eb']);
    expect(majorKeySpelling('C').accidentals).toEqual([]);
  });

  it('matches the signature to the scale for every practical key', () => {
    for (const t of MAJOR_KEY_TONICS) {
      const k = majorKeySpelling(t);
      const altered = k.notes.filter((n) => Note.get(n).acc !== '');
      expect([...k.accidentals].sort(), t).toEqual([...altered].sort());
      expect(Math.abs(k.alteration)).toBe(altered.length);
      const sign = k.alteration > 0 ? '#' : 'b';
      expect(altered.every((n) => n.endsWith(sign))).toBe(true);
    }
  });
});

describe('usesEachLetterOnce', () => {
  it('rejects repeated, skipped or invalid letters', () => {
    expect(usesEachLetterOnce(['F#', 'G#', 'A#', 'B', 'C#', 'D#', 'F'])).toBe(false);
    expect(usesEachLetterOnce(['C', 'E', 'F', 'G', 'A', 'B', 'D'])).toBe(false);
    expect(usesEachLetterOnce(['C', 'H'])).toBe(false);
    expect(usesEachLetterOnce([])).toBe(true);
  });
});

describe('compareSpelling', () => {
  it('separates correct, enharmonic and wrong answers', () => {
    expect(compareSpelling('E#', 'E#')).toBe('correct');
    expect(compareSpelling('E#', 'F')).toBe('enharmonic');
    expect(compareSpelling('Bb', 'A#')).toBe('enharmonic');
    expect(compareSpelling('Bb', 'B')).toBe('wrong');
    expect(compareSpelling('C', 'C4')).toBe('correct');
    expect(compareSpelling('C', 'nope')).toBe('wrong');
    expect(compareSpelling('nope', 'C')).toBe('wrong');
  });

  it('grades whole sequences, treating missing notes as wrong', () => {
    expect(compareSpellings(majorScale('F#'), ['F#', 'G#', 'A#', 'B', 'C#', 'D#', 'F'])).toEqual([
      'correct',
      'correct',
      'correct',
      'correct',
      'correct',
      'correct',
      'enharmonic',
    ]);
    expect(compareSpellings(['C', 'E', 'G'], ['C', 'Eb'])).toEqual(['correct', 'wrong', 'wrong']);
  });
});
