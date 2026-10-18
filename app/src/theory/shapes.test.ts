import { describe, expect, it } from 'vitest';
import { Chord, Interval } from 'tonal';
import { CHROMATIC_ROOTS } from '../test/fixtures';
import { noteAt, samePitchClass } from './fretboard';
import {
  CAGED_ORDER,
  cagedChain,
  cagedShape,
  triadVoicings,
  type Degree,
  type ShapeNote,
} from './shapes';

const DEGREE_INTERVAL: Record<Degree, string> = { R: '1P', '3': '3M', b3: '3m', '5': '5P' };

function expectDegrees(root: string, notes: readonly ShapeNote[]) {
  for (const n of notes) {
    const pc = noteAt(n).pc;
    const interval = Interval.distance(root, pc);
    expect(Interval.semitones(interval) % 12, `${root} ${n.degree} at s${n.string}f${n.fret}`).toBe(
      Interval.semitones(DEGREE_INTERVAL[n.degree]) % 12,
    );
  }
}

describe('cagedShape', () => {
  it('reproduces the open-position C, A, G, E and D chords', () => {
    expect(cagedShape('C', 'C').notes.map((n) => n.fret)).toEqual([3, 2, 0, 1, 0]);
    expect(cagedShape('A', 'A').notes.map((n) => n.fret)).toEqual([0, 2, 2, 2, 0]);
    expect(cagedShape('G', 'G').notes.map((n) => n.fret)).toEqual([3, 2, 0, 0, 0, 3]);
    expect(cagedShape('E', 'E').notes.map((n) => n.fret)).toEqual([0, 2, 2, 1, 0, 0]);
    expect(cagedShape('D', 'D').notes.map((n) => n.fret)).toEqual([0, 2, 3, 2]);
  });

  it('builds every shape for every root with correct chord tones', () => {
    for (const root of CHROMATIC_ROOTS) {
      const chord = Chord.getChord('M', root).notes;
      for (const shape of CAGED_ORDER) {
        const s = cagedShape(shape, root);
        expect(s.notes.every((n) => n.fret >= 0)).toBe(true);
        expect(s.notes.every((n) => chord.some((c) => samePitchClass(c, noteAt(n).pc)))).toBe(true);
        expectDegrees(root, s.notes);
        const root0 = s.notes.find((n) => n.string === s.rootString);
        expect(root0?.degree).toBe('R');
      }
    }
  });

  it('places the shape above a minimum fret', () => {
    const e = cagedShape('E', 'G', { minFret: 5 });
    expect(e.rootFret).toBe(15);
    expect(cagedShape('E', 'G').rootFret).toBe(3);
  });

  it('throws when the shape cannot fit on the neck', () => {
    expect(() => cagedShape('D', 'D', { minFret: 22 })).toThrow(RangeError);
  });
});

describe('cagedChain', () => {
  it('chains C major as C → A → G → E → D up the neck', () => {
    expect(cagedChain('C').map((s) => s.shape)).toEqual(['C', 'A', 'G', 'E', 'D']);
  });

  it('chains G major starting from the G shape', () => {
    expect(cagedChain('G').map((s) => s.shape)).toEqual(['G', 'E', 'D', 'C', 'A']);
  });
});

describe('triadVoicings', () => {
  it('finds C major root position on strings 3–1 at frets 5/5/3... ', () => {
    const v = triadVoicings('C', 'major', 3, 0);
    expect(v.map((x) => x.notes.map((n) => n.fret))).toContainEqual([5, 5, 3]);
  });

  it('covers every root, string set, quality and inversion', () => {
    for (const root of CHROMATIC_ROOTS) {
      for (const quality of ['major', 'minor'] as const) {
        for (const low of [6, 5, 4, 3]) {
          for (const inversion of [0, 1, 2] as const) {
            const voicings = triadVoicings(root, quality, low, inversion);
            expect(voicings.length, `${root} ${quality} s${low} inv${inversion}`).toBeGreaterThan(
              0,
            );
            for (const v of voicings) {
              expectDegrees(root, v.notes);
              const bass = v.notes[0]?.degree;
              const expectedBass = (['R', quality === 'major' ? '3' : 'b3', '5'] as const)[
                inversion
              ];
              expect(bass).toBe(expectedBass);
              const frets = v.notes.map((n) => n.fret);
              expect(Math.max(...frets) - Math.min(...frets)).toBeLessThanOrEqual(4);
            }
          }
        }
      }
    }
  });

  it('rejects impossible string sets and roots', () => {
    expect(() => triadVoicings('C', 'major', 2, 0)).toThrow(RangeError);
    expect(() => triadVoicings('H', 'major', 3, 0)).toThrow();
  });
});
