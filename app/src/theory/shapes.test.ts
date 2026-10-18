import { describe, expect, it } from 'vitest';
import { Chord, Interval } from 'tonal';
import { CHROMATIC_ROOTS } from '../test/fixtures';
import { MAX_FRET, noteAt, samePitchClass, samePosition } from './fretboard';
import {
  CAGED_ORDER,
  CAGED_QUALITIES,
  cagedChain,
  cagedShape,
  nextCagedShape,
  previousCagedShape,
  shapeSpan,
  triadCore,
  triadCores,
  triadVoicings,
  type CagedQuality,
  type CagedShapeName,
  type Degree,
  type Inversion,
  type ShapeNote,
} from './shapes';

const DEGREE_INTERVAL: Record<Degree, string> = {
  R: '1P',
  '3': '3M',
  b3: '3m',
  '5': '5P',
  b7: '7m',
};
const CHORD_SYMBOL: Record<CagedQuality, string> = { major: 'M', minor: 'm', dominant7: '7' };
const frets = (shape: CagedShapeName, root: string, quality: CagedQuality) =>
  cagedShape(shape, root, { quality }).notes.map((n) => n.fret);

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

  it('reproduces the open-position minor chords', () => {
    expect(frets('C', 'C', 'minor')).toEqual([3, 1, 0, 1, 3]);
    expect(frets('A', 'A', 'minor')).toEqual([0, 2, 2, 1, 0]);
    expect(frets('G', 'G', 'minor')).toEqual([3, 1, 0, 0, 3, 3]);
    expect(frets('E', 'E', 'minor')).toEqual([0, 2, 2, 0, 0, 0]);
    expect(frets('D', 'D', 'minor')).toEqual([0, 2, 3, 1]);
  });

  it('reproduces the open-position dominant-7 chords', () => {
    expect(frets('C', 'C', 'dominant7')).toEqual([3, 2, 3, 1, 0]);
    expect(frets('A', 'A', 'dominant7')).toEqual([0, 2, 0, 2, 0]);
    expect(frets('G', 'G', 'dominant7')).toEqual([3, 2, 0, 0, 0, 1]);
    expect(frets('E', 'E', 'dominant7')).toEqual([0, 2, 0, 1, 0, 0]);
    expect(frets('D', 'D', 'dominant7')).toEqual([0, 2, 1, 2]);
  });

  it('defaults to major and records the quality', () => {
    expect(cagedShape('E', 'A').quality).toBe('major');
    expect(cagedShape('E', 'A', { quality: 'minor' }).quality).toBe('minor');
  });

  it('builds every shape and quality for every root with correct chord tones', () => {
    for (const quality of CAGED_QUALITIES) {
      for (const root of CHROMATIC_ROOTS) {
        const chord = Chord.getChord(CHORD_SYMBOL[quality], root).notes;
        for (const shape of CAGED_ORDER) {
          const label = `${shape} shape of ${root} ${quality}`;
          const s = cagedShape(shape, root, { quality });
          expect(s.notes.every((n) => n.fret >= 0 && n.fret <= MAX_FRET)).toBe(true);
          expect(
            s.notes.every((n) => chord.some((c) => samePitchClass(c, noteAt(n).pc))),
            label,
          ).toBe(true);
          expectDegrees(root, s.notes);
          const root0 = s.notes.find((n) => n.string === s.rootString);
          expect(root0?.degree).toBe('R');
          expect(root0?.fret).toBe(s.rootFret);
          // Low-to-high, one note per string, playable in a 4-fret span.
          expect(s.notes.map((n) => n.string)).toEqual(
            [...s.notes.map((n) => n.string)].sort((a, b) => b - a),
          );
          expect(shapeSpan(s).to - shapeSpan(s).from, label).toBeLessThanOrEqual(3);
          const degrees = new Set(s.notes.map((n) => n.degree));
          expect(degrees.has('R') && degrees.has(quality === 'minor' ? 'b3' : '3'), label).toBe(
            true,
          );
          expect(degrees.has('b7'), label).toBe(quality === 'dominant7');
          expect(degrees.has(quality === 'minor' ? '3' : 'b3'), label).toBe(false);
        }
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

  it('chains A minor and E7 from their open shapes', () => {
    expect(cagedChain('A', { quality: 'minor' }).map((s) => s.shape)).toEqual([
      'A',
      'G',
      'E',
      'D',
      'C',
    ]);
    expect(cagedChain('E', { quality: 'dominant7' }).map((s) => s.shape)).toEqual([
      'E',
      'D',
      'C',
      'A',
      'G',
    ]);
  });

  it('links every chain: CAGED order, ascending, adjacent shapes sharing a root', () => {
    for (const quality of CAGED_QUALITIES) {
      for (const root of CHROMATIC_ROOTS) {
        const chain = cagedChain(root, { quality });
        const label = `${root} ${quality}`;
        expect(chain.map((s) => s.quality)).toEqual(Array(5).fill(quality));
        for (let i = 1; i < chain.length; i++) {
          const prev = chain[i - 1] as (typeof chain)[number];
          const cur = chain[i] as (typeof chain)[number];
          expect(cur.shape, label).toBe(nextCagedShape(prev.shape));
          expect(shapeSpan(cur).from, label).toBeGreaterThanOrEqual(shapeSpan(prev).from);
          expect(shapeSpan(cur).from, label).toBeLessThanOrEqual(shapeSpan(prev).to);
          // A dominant-7 grip can swap a root for the b7 (A7 on string 3), so
          // its chain is checked against the major chain's positions instead.
          if (quality === 'dominant7') continue;
          const roots = (s: typeof cur) => s.notes.filter((n) => n.degree === 'R');
          expect(
            roots(cur).some((a) => roots(prev).some((b) => samePosition(a, b))),
            `${label} ${prev.shape}→${cur.shape}`,
          ).toBe(true);
        }
        if (quality === 'dominant7') {
          expect(chain.map((s) => [s.shape, s.rootFret])).toEqual(
            cagedChain(root).map((s) => [s.shape, s.rootFret]),
          );
        }
      }
    }
  });
});

describe('next and previous shapes', () => {
  it('walks the CAGED cycle both ways', () => {
    expect(CAGED_ORDER.map(nextCagedShape)).toEqual(['A', 'G', 'E', 'D', 'C']);
    expect(CAGED_ORDER.map(previousCagedShape)).toEqual(['D', 'C', 'A', 'G', 'E']);
    for (const s of CAGED_ORDER) expect(previousCagedShape(nextCagedShape(s))).toBe(s);
  });
});

describe('triad cores', () => {
  const EXPECTED: Record<
    'major' | 'minor',
    Record<CagedShapeName, { lowString: number; inversion: Inversion }>
  > = {
    major: {
      C: { lowString: 3, inversion: 2 },
      A: { lowString: 3, inversion: 0 },
      G: { lowString: 4, inversion: 2 },
      E: { lowString: 3, inversion: 1 },
      D: { lowString: 3, inversion: 2 },
    },
    minor: {
      C: { lowString: 4, inversion: 1 },
      A: { lowString: 3, inversion: 0 },
      G: { lowString: 5, inversion: 1 },
      E: { lowString: 3, inversion: 1 },
      D: { lowString: 3, inversion: 2 },
    },
  };

  it('finds the open C shape cores on strings 3–1, 4–2 and 5–3', () => {
    const cores = triadCores(cagedShape('C', 'C'));
    expect(cores.map((c) => [c.lowString, c.inversion, c.notes.map((n) => n.fret)])).toEqual([
      [3, 2, [0, 1, 0]],
      [4, 1, [2, 0, 1]],
      [5, 0, [3, 2, 0]],
    ]);
  });

  it('picks the top-string core of each shape, the same for every root', () => {
    for (const quality of ['major', 'minor'] as const) {
      for (const root of CHROMATIC_ROOTS) {
        for (const shape of CAGED_ORDER) {
          const core = triadCore(cagedShape(shape, root, { quality }));
          expect(
            { lowString: core.lowString, inversion: core.inversion },
            `${shape} ${root} ${quality}`,
          ).toEqual(EXPECTED[quality][shape]);
        }
      }
    }
  });

  it('takes every core from the shape itself, as a valid close triad voicing', () => {
    for (const quality of ['major', 'minor'] as const) {
      for (const root of CHROMATIC_ROOTS) {
        for (const shape of CAGED_ORDER) {
          const s = cagedShape(shape, root, { quality });
          const cores = triadCores(s);
          expect(cores.length).toBeGreaterThan(0);
          for (const core of cores) {
            const label = `${shape} ${root} ${quality} s${core.lowString}`;
            expect(core.shape).toBe(shape);
            expect(core.quality).toBe(quality);
            expect(core.root).toBe(root);
            expect(
              core.notes.every((n) => s.notes.some((m) => samePosition(m, n))),
              label,
            ).toBe(true);
            expectDegrees(root, core.notes);
            const voicings = triadVoicings(root, quality, core.lowString, core.inversion, {
              maxFret: MAX_FRET,
            });
            expect(
              voicings.some((v) =>
                v.notes.every((n, i) => samePosition(n, core.notes[i] as ShapeNote)),
              ),
              label,
            ).toBe(true);
          }
          expect(cores.map((c) => c.lowString)).toEqual(
            [...cores.map((c) => c.lowString)].sort((a, b) => a - b),
          );
        }
      }
    }
  });

  it('gives a dominant-7 shape the major cores at the same position', () => {
    for (const root of CHROMATIC_ROOTS) {
      for (const shape of CAGED_ORDER) {
        const dom = cagedShape(shape, root, { quality: 'dominant7' });
        const major = cagedShape(shape, root);
        expect(dom.rootFret).toBe(major.rootFret);
        expect(triadCores(dom)).toEqual(triadCores(major));
        expect(triadCore(dom).quality).toBe('major');
      }
    }
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
