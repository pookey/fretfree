import { describe, expect, it } from 'vitest';
import { Interval } from 'tonal';
import {
  DROP_D_TUNING,
  MAX_FRET,
  STANDARD_TUNING,
  allStrings,
  crossesGBShift,
  midiAt,
  noteAt,
  octaveShapeUp,
  type Position,
} from './fretboard';
import {
  INTERVALS,
  SHAPE_INTERVALS,
  intervalBetween,
  intervalFromRoot,
  intervalFromSemitones,
  intervalInfo,
  intervalSemitones,
  intervalShape,
  intervalShapes,
  isIntervalName,
  octaveOnString,
  positionForInterval,
  positionsForInterval,
  semitonesBetween,
  type IntervalName,
} from './intervals';

const STRINGS = allStrings();

function everyPosition(maxFret = MAX_FRET): Position[] {
  const out: Position[] = [];
  for (const string of STRINGS)
    for (let fret = 0; fret <= maxFret; fret++) out.push({ string, fret });
  return out;
}

/** tonal's shorthand for each name, as an independent oracle. */
const TONAL: Record<IntervalName, string> = {
  P1: '1P',
  m2: '2m',
  M2: '2M',
  m3: '3m',
  M3: '3M',
  P4: '4P',
  TT: '4A',
  P5: '5P',
  m6: '6m',
  M6: '6M',
  m7: '7m',
  M7: '7M',
  P8: '8P',
};

describe('interval table', () => {
  it('lists P1–P8 indexed by semitones, agreeing with tonal', () => {
    expect(INTERVALS).toHaveLength(13);
    INTERVALS.forEach((info, i) => {
      expect(info.semitones).toBe(i);
      expect(Interval.semitones(TONAL[info.name])).toBe(i);
      expect(Interval.get(TONAL[info.name]).num).toBe(info.number);
    });
  });

  it('teaches m2 to P8 as shapes', () => {
    expect(SHAPE_INTERVALS).toEqual([
      'm2',
      'M2',
      'm3',
      'M3',
      'P4',
      'TT',
      'P5',
      'm6',
      'M6',
      'm7',
      'M7',
      'P8',
    ]);
  });

  it('labels degrees the way C3/C5 drills ask for them', () => {
    expect(intervalInfo('m7').degree).toBe('b7');
    expect(intervalInfo('M7').degree).toBe('7');
    expect(intervalInfo('M3').degree).toBe('3');
    expect(intervalInfo('TT').long).toBe('tritone');
  });

  it('guards names and rejects unknown ones', () => {
    for (const i of INTERVALS) expect(isIntervalName(i.name)).toBe(true);
    expect(isIntervalName('M4')).toBe(false);
    expect(() => intervalInfo('M4' as IntervalName)).toThrow(/Unknown interval/);
  });

  it('octave-reduces semitone distances', () => {
    expect(intervalFromSemitones(0)).toBe('P1');
    for (let n = 1; n <= 11; n++) {
      expect(intervalFromSemitones(n)).toBe(INTERVALS[n]?.name);
      expect(intervalFromSemitones(-n)).toBe(INTERVALS[n]?.name);
      expect(intervalFromSemitones(n + 12)).toBe(INTERVALS[n]?.name);
      expect(intervalFromSemitones(n + 24)).toBe(INTERVALS[n]?.name);
    }
    for (const n of [12, -12, 24, 36]) expect(intervalFromSemitones(n)).toBe('P8');
    expect(() => intervalFromSemitones(1.5)).toThrow(RangeError);
  });
});

describe('intervalBetween — exhaustive over every pair of positions', () => {
  const all = everyPosition();

  it('matches the pitch distance for every pair, either way round', () => {
    for (const a of all) {
      for (const b of all) {
        const diff = Math.abs(midiAt(b) - midiAt(a));
        const name = intervalBetween(a, b);
        expect(name).toBe(intervalBetween(b, a));
        const semis = intervalSemitones(name);
        if (diff === 0) expect(name).toBe('P1');
        else expect(semis === 12 ? diff % 12 === 0 : diff % 12 === semis).toBe(true);
      }
    }
  });

  it('names familiar shapes', () => {
    // Power-chord 5th: s6f3 (G) → s5f5 (D).
    expect(intervalBetween({ string: 6, fret: 3 }, { string: 5, fret: 5 })).toBe('P5');
    // Octave shape across the G–B pair: s4f5 (G) → s2f8 (G).
    expect(intervalBetween({ string: 4, fret: 5 }, { string: 2, fret: 8 })).toBe('P8');
    // Same fret, adjacent strings: P4 except across G–B (M3).
    expect(intervalBetween({ string: 4, fret: 2 }, { string: 3, fret: 2 })).toBe('P4');
    expect(intervalBetween({ string: 3, fret: 2 }, { string: 2, fret: 2 })).toBe('M3');
    // Unison across strings: s6f5 (A) and open A.
    expect(intervalBetween({ string: 6, fret: 5 }, { string: 5, fret: 0 })).toBe('P1');
    // Compound: open low E to s1f3 (G4) is a m10 → m3.
    expect(intervalBetween({ string: 6, fret: 0 }, { string: 1, fret: 3 })).toBe('m3');
  });

  it('reports the signed distance', () => {
    expect(semitonesBetween({ string: 6, fret: 0 }, { string: 5, fret: 0 })).toBe(5);
    expect(semitonesBetween({ string: 5, fret: 0 }, { string: 6, fret: 0 })).toBe(-5);
  });

  it('uses the tuning', () => {
    const a = { string: 6, fret: 0 };
    const b = { string: 5, fret: 0 };
    expect(intervalBetween(a, b)).toBe('P4');
    expect(intervalBetween(a, b, DROP_D_TUNING)).toBe('P5');
  });
});

describe('intervalFromRoot', () => {
  it('is the degree of the pitch class above the root, for every pair', () => {
    const all = everyPosition(12);
    for (const root of all) {
      for (const pos of all) {
        const name = intervalFromRoot(root, pos);
        const up = (((midiAt(pos) - midiAt(root)) % 12) + 12) % 12;
        if (midiAt(pos) === midiAt(root)) expect(name).toBe('P1');
        else expect(intervalSemitones(name) % 12).toBe(up);
        const tonal = Interval.distance(noteAt(root).pc, noteAt(pos).pc);
        expect(Interval.semitones(tonal) % 12).toBe(up);
      }
    }
  });

  it('treats a note below the root as the same degree', () => {
    const c = { string: 5, fret: 3 }; // C3
    expect(intervalFromRoot(c, { string: 6, fret: 3 })).toBe('P5'); // G2, below
    expect(intervalFromRoot(c, { string: 4, fret: 5 })).toBe('P5'); // G3, above
    expect(intervalFromRoot(c, { string: 6, fret: 6 })).toBe('m7'); // Bb2, below
    expect(intervalFromRoot(c, { string: 2, fret: 1 })).toBe('P8'); // C4
  });
});

describe('positionForInterval — exhaustive', () => {
  it('lands on the exact pitch for every root, interval, string and direction', () => {
    for (const root of everyPosition()) {
      for (const interval of INTERVALS.map((i) => i.name)) {
        for (const string of STRINGS) {
          for (const direction of ['up', 'down'] as const) {
            const target =
              midiAt(root) + (direction === 'up' ? 1 : -1) * intervalSemitones(interval);
            const pos = positionForInterval(root, interval, string, { direction });
            const fret = target - midiAt({ string, fret: 0 });
            if (fret < 0 || fret > MAX_FRET) expect(pos).toBeNull();
            else expect(pos).toEqual({ string, fret });
          }
        }
      }
    }
  });

  it('defaults to ascending', () => {
    expect(positionForInterval({ string: 6, fret: 3 }, 'P5', 5)).toEqual({ string: 5, fret: 5 });
    expect(positionForInterval({ string: 5, fret: 5 }, 'P5', 6, { direction: 'down' })).toEqual({
      string: 6,
      fret: 3,
    });
  });

  it('shifts one fret higher across the G–B pair', () => {
    // M3 above the root on the next string: one fret back, except G → B.
    expect(positionForInterval({ string: 6, fret: 5 }, 'M3', 5)).toEqual({ string: 5, fret: 4 });
    expect(positionForInterval({ string: 5, fret: 5 }, 'M3', 4)).toEqual({ string: 4, fret: 4 });
    expect(positionForInterval({ string: 4, fret: 5 }, 'M3', 3)).toEqual({ string: 3, fret: 4 });
    expect(positionForInterval({ string: 3, fret: 5 }, 'M3', 2)).toEqual({ string: 2, fret: 5 });
    expect(positionForInterval({ string: 2, fret: 5 }, 'M3', 1)).toEqual({ string: 1, fret: 4 });
    // P5 two strings up: +2 frets, +3 when the pair spans G–B.
    expect(positionForInterval({ string: 6, fret: 3 }, 'P8', 4)).toEqual({ string: 4, fret: 5 });
    expect(positionForInterval({ string: 4, fret: 3 }, 'P8', 2)).toEqual({ string: 2, fret: 6 });
  });

  it('returns null off the neck', () => {
    expect(positionForInterval({ string: 1, fret: 0 }, 'P5', 6)).toBeNull();
    expect(positionForInterval({ string: 6, fret: 0 }, 'm2', 6, { direction: 'down' })).toBeNull();
    expect(positionForInterval({ string: 1, fret: MAX_FRET }, 'm2', 1)).toBeNull();
  });

  it('agrees with the existing octave shape', () => {
    for (const root of everyPosition()) {
      if (root.string < 3) continue;
      expect(positionForInterval(root, 'P8', root.string - 2)).toEqual(octaveShapeUp(root));
    }
  });
});

describe('positionsForInterval', () => {
  it('finds every b7 of a root in a region, both sides of the root', () => {
    const root = { string: 5, fret: 3 }; // C
    const found = positionsForInterval(root, 'm7', { fretRange: { from: 0, to: 5 } });
    expect(found.every((p) => noteAt(p, STANDARD_TUNING, 'flat').pc === 'Bb')).toBe(true);
    expect(found).toEqual([
      { string: 3, fret: 3 },
      { string: 5, fret: 1 },
    ]);
  });

  it('matches a brute-force pitch-class search for every root and interval', () => {
    const window = { fretRange: { from: 0, to: 12 } };
    for (const root of everyPosition(12)) {
      for (const interval of INTERVALS.map((i) => i.name)) {
        const want = (midiAt(root) + intervalSemitones(interval)) % 12;
        const found = positionsForInterval(root, interval, window);
        const expected = everyPosition(12).filter(
          (p) => midiAt(p) % 12 === want && !(p.string === root.string && p.fret === root.fret),
        );
        expect(found).toEqual(expected);
      }
    }
  });
});

describe('interval shapes — every m2–P8 shape for every string pair', () => {
  const shapes = intervalShapes();

  it('covers every ordered string pair and interval once', () => {
    expect(shapes).toHaveLength(STRINGS.length * STRINGS.length * SHAPE_INTERVALS.length);
    const keys = new Set(shapes.map((s) => `${s.interval}:${s.fromString}>${s.toString}`));
    expect(keys.size).toBe(shapes.length);
    expect(shapes[0]).toMatchObject({ fromString: 6, toString: 6, interval: 'm2' });
  });

  it('is movable: placing a shape anywhere on the neck sounds the interval', () => {
    for (const s of shapes) {
      for (let fret = 0; fret <= MAX_FRET; fret++) {
        const upper = fret + s.fretOffset;
        if (upper < 0 || upper > MAX_FRET) continue;
        const diff = semitonesBetween(
          { string: s.fromString, fret },
          { string: s.toString, fret: upper },
        );
        expect(diff).toBe(intervalSemitones(s.interval));
      }
    }
  });

  it('flags the G–B shift: one fret off the all-fourths shape', () => {
    for (const s of shapes) {
      expect(s.gbShift).toBe(crossesGBShift(s.fromString, s.toString));
      const fourths = intervalSemitones(s.interval) - 5 * (s.fromString - s.toString);
      const shift =
        s.fromString >= 3 && s.toString <= 2 ? 1 : s.fromString <= 2 && s.toString >= 3 ? -1 : 0;
      expect(s.fretOffset).toBe(fourths + shift);
    }
    expect(intervalShape('M3', 3, 2)).toEqual({
      interval: 'M3',
      fromString: 3,
      toString: 2,
      fretOffset: 0,
      gbShift: true,
    });
    expect(intervalShape('M3', 4, 3)).toMatchObject({ fretOffset: -1, gbShift: false });
  });

  it('reproduces the textbook shapes', () => {
    const offset = (i: IntervalName, from: number, to: number) =>
      intervalShape(i, from, to).fretOffset;
    expect(offset('P5', 6, 5)).toBe(2);
    expect(offset('P8', 6, 4)).toBe(2);
    expect(offset('P8', 4, 2)).toBe(3);
    expect(offset('P8', 3, 1)).toBe(3);
    expect(offset('m7', 5, 4)).toBe(5);
    expect(offset('M7', 6, 5)).toBe(6);
    expect(offset('m2', 2, 2)).toBe(1);
  });

  it('supports other tunings and interval subsets', () => {
    const dropD = intervalShapes({ tuning: DROP_D_TUNING, intervals: ['P5'] });
    expect(dropD).toHaveLength(36);
    expect(dropD.find((s) => s.fromString === 6 && s.toString === 5)?.fretOffset).toBe(0);
  });
});

describe('octaveOnString', () => {
  it('finds the octave nearest in fret on every other string, for every position', () => {
    for (const pos of everyPosition()) {
      for (const string of STRINGS) {
        const found = octaveOnString(pos, string);
        const candidates = Array.from({ length: MAX_FRET + 1 }, (_, fret) => ({
          string,
          fret,
        })).filter((p) => {
          const d = midiAt(p) - midiAt(pos);
          return d !== 0 && d % 12 === 0;
        });
        if (candidates.length === 0) {
          expect(found).toBeNull();
          continue;
        }
        expect(found).not.toBeNull();
        const best = Math.min(...candidates.map((p) => Math.abs(p.fret - pos.fret)));
        expect(Math.abs((found as Position).fret - pos.fret)).toBe(best);
        const d = midiAt(found as Position) - midiAt(pos);
        expect(d !== 0 && d % 12 === 0).toBe(true);
      }
    }
  });

  it('handles the classic C1 items, including the G–B shift', () => {
    expect(octaveOnString({ string: 6, fret: 5 }, 4)).toEqual({ string: 4, fret: 7 });
    expect(octaveOnString({ string: 4, fret: 5 }, 2)).toEqual({ string: 2, fret: 8 });
    expect(octaveOnString({ string: 3, fret: 2 }, 1)).toEqual({ string: 1, fret: 5 });
    expect(octaveOnString({ string: 6, fret: 5 }, 1)).toEqual({ string: 1, fret: 5 });
    // Same string: the 12th-fret octave.
    expect(octaveOnString({ string: 5, fret: 3 }, 5)).toEqual({ string: 5, fret: 15 });
  });

  it('prefers the higher octave on a tie', () => {
    expect(octaveOnString({ string: 6, fret: 12 }, 6)).toEqual({ string: 6, fret: 24 });
  });
});
