import { describe, expect, it } from 'vitest';
import { getSkill } from '../../engine';
import {
  DROP_D_TUNING,
  STANDARD_TUNING,
  octaveOnString,
  type Position,
  type Tuning,
} from '../../theory';
import { octaveShapeOffset } from '../../engine/skills/c1';
import type { DrillFeedback } from '../types';
import {
  D4_SCOPE,
  d4CanTest,
  d4Check,
  d4ConceptOf,
  d4DescribeAnswer,
  d4Explain,
  d4FeedbackPositions,
  d4Found,
  d4GradedResponseMs,
  d4IsLive,
  d4MakePrompt,
  d4Missed,
  d4NeckGuideLevel,
  d4OtherOffset,
  d4RegionWindow,
  d4Regions,
  d4ScopeFor,
  d4ShapeLabel,
  d4ShapeWindow,
  d4ShowsCount,
  d4Sounds,
  d4TargetsIn,
  d4WrongTaps,
  type D4Answer,
  type D4EveryPrompt,
  type D4Prompt,
  type D4SinglePrompt,
} from './logic';

const ctx = (over: { scopeLevel?: number; rng?: () => number; tuning?: Tuning } = {}) => ({
  tuning: over.tuning ?? STANDARD_TUNING,
  accidentalPref: 'sharp' as const,
  scopeLevel: over.scopeLevel ?? 0,
  rng: over.rng ?? (() => 0),
});

const single = (id: string, scopeLevel = 0) =>
  d4MakePrompt({ id, skillId: 'C1.octaves' }, ctx({ scopeLevel })) as D4SinglePrompt;
const every = (id: string, rng = () => 0) =>
  d4MakePrompt({ id, skillId: 'C1.every-octave' }, ctx({ rng })) as D4EveryPrompt;
const fb = (p: D4Prompt, answer: D4Answer): DrillFeedback<D4Answer> => ({
  answer,
  result: d4Check(p, answer),
});
const at = (string: number, fret: number): Position => ({ string, fret });

/** Every G in frets 0–12. */
const GS = [at(1, 3), at(2, 8), at(3, 0), at(3, 12), at(4, 5), at(5, 10), at(6, 3)];

describe('D4 items', () => {
  it('tests single octave items and every-octave items only', () => {
    expect(d4CanTest({ id: 'octave:s6f5→s4', skillId: 'C1.octaves' })).toBe(true);
    expect(d4CanTest({ id: 'octaves:G', skillId: 'C1.every-octave' })).toBe(true);
    expect(d4CanTest({ id: 'find:G@s5', skillId: 'C2.all-notes' })).toBe(false);
    expect(() => d4MakePrompt({ id: 'find:G@s5', skillId: 'x' }, ctx())).toThrow(/cannot test/);
  });

  it('refuses strings the tuning does not have', () => {
    const four: Tuning = { ...STANDARD_TUNING, notes: STANDARD_TUNING.notes.slice(2) };
    const item = { id: 'octave:s6f5→s4', skillId: 'C1.octaves' };
    expect(() => d4MakePrompt(item, ctx({ tuning: four }))).toThrow(/cannot test/);
    expect(d4ConceptOf(item, { tuning: four, accidentalPref: 'sharp' })).toBeNull();
  });

  it('clamps the scope level', () => {
    expect(D4_SCOPE).toEqual({ minLevel: 0, maxLevel: 1 });
    expect(d4ScopeFor(-1)).toBe('string');
    expect(d4ScopeFor(0)).toBe('string');
    expect(d4ScopeFor(1)).toBe('neck');
    expect(d4ScopeFor(9)).toBe('neck');
  });
});

describe('D4 single octave', () => {
  it('asks for the octave nearest in fret on the named string', () => {
    const p = single('octave:s6f5→s4');
    expect(p).toMatchObject({
      mode: 'single',
      pc: 'A',
      source: at(6, 5),
      targets: [at(4, 7)],
      string: 4,
      offset: 2,
      shape: '2 strings up, 2 frets higher',
      gbShift: false,
      otherFret: 8,
      otherShape: '2 strings up, 3 frets higher',
      scope: 'string',
      liveStrings: [4],
    });
    expect(single('octave:s6f5→s4', 1).liveStrings).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('matches the C1 shape offset for every item', () => {
    for (const skillId of ['C1.octaves', 'C1.octaves-gb-shift', 'C1.double-octaves']) {
      for (const item of getSkill(skillId)!.items()) {
        const p = d4MakePrompt(item, ctx()) as D4SinglePrompt;
        expect(p.offset, item.id).toBe(octaveShapeOffset(p.source.string, p.string));
        expect(p.targets).toEqual([octaveOnString(p.source, p.string)]);
        expect(d4ConceptOf(item, { tuning: STANDARD_TUNING, accidentalPref: 'sharp' })).toBe(
          p.shape,
        );
      }
    }
  });

  it('shifts a fret across the G–B strings, either way', () => {
    expect(single('octave:s4f5→s2')).toMatchObject({
      targets: [at(2, 8)],
      shape: '2 strings up, 3 frets higher',
      gbShift: true,
      otherFret: 7,
      otherShape: '2 strings up, 2 frets higher',
    });
    expect(single('octave:s2f8→s4')).toMatchObject({
      targets: [at(4, 5)],
      shape: '2 strings down, 3 frets lower',
      otherFret: 6,
      otherShape: '2 strings down, 2 frets lower',
    });
    expect(single('octave:s5f3→s2')).toMatchObject({
      targets: [at(2, 1)],
      shape: '3 strings up, 2 frets lower',
      otherShape: '3 strings up, 3 frets lower',
    });
    expect(single('octave:s6f3→s1')).toMatchObject({
      targets: [at(1, 3)],
      shape: '5 strings up, same fret',
      otherShape: '5 strings up, 1 fret lower',
    });
  });

  it('labels shapes', () => {
    expect(d4ShapeLabel(6, 5, 5)).toBe('1 string up, 5 frets higher');
    expect(d4ShapeLabel(3, 6, 3)).toBe('3 strings down, 3 frets higher');
    expect(d4ShapeLabel(1, 2, -1)).toBe('1 string down, 1 fret lower');
    expect(d4OtherOffset(6, 4, 2, STANDARD_TUNING)).toBe(3);
    expect(d4OtherOffset(4, 6, -2, STANDARD_TUNING)).toBe(-3);
    expect(d4OtherOffset(4, 2, 3, STANDARD_TUNING)).toBe(2);
    expect(d4OtherOffset(2, 4, -3, STANDARD_TUNING)).toBe(-2);
  });

  it('grades the tap, and logs the unshifted fret as a shape confusion', () => {
    const p = single('octave:s4f5→s2');
    expect(d4Check(p, [at(2, 8)])).toEqual({
      correct: true,
      expected: '2 strings up, 3 frets higher',
    });
    expect(d4Check(p, [at(2, 7)])).toEqual({
      correct: false,
      expected: '2 strings up, 3 frets higher',
      confusedWith: '2 strings up, 2 frets higher',
    });
    // The same fret on another string is just wrong.
    expect(d4Check(p, [at(3, 7)])).toEqual({
      correct: false,
      expected: '2 strings up, 3 frets higher',
    });
    expect(d4Check(p, []).correct).toBe(false);
    // Over-applying the shift to a shape that doesn't cross it is the same confusion.
    expect(d4Check(single('octave:s6f5→s4'), [at(4, 8)]).confusedWith).toBe(
      '2 strings up, 3 frets higher',
    );
  });

  it('explains the shape and the G–B shift', () => {
    const p = single('octave:s4f5→s2');
    expect(d4Explain(p, fb(p, [at(2, 8)]))).toBe(
      'The octave is at string 2, fret 8: 2 strings up, 3 frets higher. The shape crosses the G–B strings, which are a fret closer, so it shifts a fret.',
    );
    expect(d4Explain(p, fb(p, [at(2, 7)]))).toMatch(
      /^You tapped F# \(string 2, fret 7\)\. That is the shape without the G–B shift: 2 strings up, 2 frets higher\. The octave is at string 2, fret 8/,
    );
    expect(d4Explain(p, fb(p, [at(1, 1)]))).toMatch(
      /^You tapped F \(string 1, fret 1\)\. The octave/,
    );
    const plain = single('octave:s6f5→s4');
    expect(d4Explain(plain, fb(plain, [at(4, 8)]))).toBe(
      "You tapped A# (string 4, fret 8). This shape doesn't cross the G–B strings, so there is no extra fret. The octave is at string 4, fret 7: 2 strings up, 2 frets higher.",
    );
  });

  it('plays the dot and its octave, then a wrong tap', () => {
    const p = single('octave:s6f5→s4');
    expect(d4Sounds(p, fb(p, [at(4, 7)]))).toEqual({ expected: ['A2', 'A3'] });
    expect(d4Sounds(p, fb(p, [at(4, 8)]))).toEqual({ expected: ['A2', 'A3'], given: ['A#3'] });
    expect(d4FeedbackPositions(p, fb(p, [at(4, 8)]))).toEqual({
      expected: [at(4, 7)],
      given: [at(4, 8)],
    });
  });

  it('describes and times the answer as given', () => {
    const p = single('octave:s6f5→s4');
    expect(d4DescribeAnswer([at(4, 7)])).toBe('s4f7');
    expect(d4DescribeAnswer([])).toBe('none');
    expect(d4GradedResponseMs(p, [at(4, 7)], 1800)).toBe(1800);
  });
});

describe('D4 every octave', () => {
  it('starts from a dot on a low string and asks for every other one in frets 0–12', () => {
    const p = every('octaves:G');
    expect(p.mode).toBe('every');
    expect(p.pc).toBe('G');
    expect(p.source).toEqual(at(5, 10));
    expect(every('octaves:G', () => 0.99).source).toEqual(at(6, 3));
    const all = [p.source, ...p.targets];
    expect(all).toHaveLength(GS.length);
    for (const g of GS) expect(all).toContainEqual(g);
    expect(p.targets).not.toContainEqual(p.source);
    expect(p.liveStrings).toEqual([1, 2, 3, 4, 5, 6]);
    expect(d4IsLive(p, at(1, 12))).toBe(true);
    expect(d4IsLive(p, at(1, 15))).toBe(false);
  });

  it('respells the pitch class and handles other tunings', () => {
    const flat = d4MakePrompt(
      { id: 'octaves:A#', skillId: 'C1.every-octave' },
      { ...ctx(), accidentalPref: 'flat' },
    );
    expect(flat.pc).toBe('Bb');
    const drop = d4MakePrompt(
      { id: 'octaves:D', skillId: 'C1.every-octave' },
      ctx({ tuning: DROP_D_TUNING }),
    );
    expect(drop.source.string).toBe(5);
    expect(drop.targets).toContainEqual(at(6, 0));
  });

  it('is right once every target is tapped, in any order', () => {
    const p = every('octaves:G');
    const taps = [...p.targets].reverse();
    expect(d4Check(p, taps)).toEqual({ correct: true, expected: 'G' });
    expect(d4Found(p, taps)).toEqual(taps);
    expect(d4Missed(p, taps)).toEqual([]);
    // The dot itself is never a wrong tap.
    expect(d4WrongTaps(p, [p.source, ...taps])).toEqual([]);
    expect(d4Check(p, [p.source, ...taps]).correct).toBe(true);
  });

  it('is wrong with targets left, and logs a wrong tap as a note confusion', () => {
    const p = every('octaves:G');
    const some = p.targets.slice(0, 2);
    expect(d4Check(p, some)).toEqual({ correct: false, expected: 'G' });
    expect(d4Missed(p, some)).toHaveLength(p.targets.length - 2);
    expect(d4Check(p, [...some, at(4, 6)])).toEqual({
      correct: false,
      expected: 'G',
      confusedWith: 'G#',
    });
    // A tap outside the live area has no note to confuse.
    expect(d4Check(p, [at(1, 15)])).toEqual({ correct: false, expected: 'G' });
  });

  it('explains the result', () => {
    const p = every('octaves:G');
    expect(d4Explain(p, fb(p, p.targets))).toBe("That's every G in frets 0–12.");
    expect(d4Explain(p, fb(p, p.targets.slice(1)))).toBe('1 is still to find, ringed on the neck.');
    expect(d4Explain(p, fb(p, p.targets.slice(2)))).toBe(
      '2 are still to find, ringed on the neck.',
    );
    expect(d4Explain(p, fb(p, [at(4, 6)]))).toBe(
      'You tapped G# (string 4, fret 6). 6 are still to find, ringed on the neck.',
    );
    expect(d4Explain(p, fb(p, [...p.targets, at(4, 6)]))).toBe('You tapped G# (string 4, fret 6).');
  });

  it('grades completion time per target', () => {
    const p = every('octaves:G');
    expect(p.targets).toHaveLength(6);
    expect(d4GradedResponseMs(p, p.targets, 9000)).toBe(1500);
  });

  it('plays each octave once, low to high, then the wrong tap', () => {
    const p = every('octaves:G');
    expect(d4Sounds(p, fb(p, p.targets))).toEqual({ expected: ['G2', 'G3', 'G4'] });
    expect(d4Sounds(p, fb(p, [at(4, 6)]))).toEqual({
      expected: ['G2', 'G3', 'G4'],
      given: ['G#3'],
    });
  });

  it('keys confusions by pitch class', () => {
    const item = { id: 'octaves:A#', skillId: 'C1.every-octave' };
    expect(d4ConceptOf(item, { tuning: STANDARD_TUNING, accidentalPref: 'flat' })).toBe('Bb');
    expect(d4ConceptOf({ id: 'nope', skillId: 'x' }, ctx())).toBeNull();
  });

  it('shows the target count only while guides are up', () => {
    expect(d4ShowsCount(3, false)).toBe(true);
    expect(d4ShowsCount(2, false)).toBe(true);
    expect(d4ShowsCount(1, false)).toBe(false);
    expect(d4ShowsCount(0, true)).toBe(true);
  });
});

describe('D4 neck guides', () => {
  it('hides string names that would name an answer before it is given', () => {
    const g = every('octaves:G');
    expect(d4NeckGuideLevel(g, 3, { guided: false, answered: false })).toBe(1);
    expect(d4NeckGuideLevel(g, 3, { guided: false, answered: true })).toBe(3);
    expect(d4NeckGuideLevel(g, 2, { guided: true, answered: false })).toBe(3);
    expect(d4NeckGuideLevel(g, 0, { guided: false, answered: false })).toBe(0);
    const c = single('octave:s5f3→s3');
    expect(d4NeckGuideLevel(c, 2, { guided: false, answered: false })).toBe(2);
  });
});

describe('D4 compact layout', () => {
  it('splits frets 0–12 into regions, each shown in a full-size window', () => {
    const regions = d4Regions({ from: 0, to: 12 });
    expect(regions).toEqual([
      { from: 0, to: 4 },
      { from: 5, to: 9 },
      { from: 10, to: 12 },
    ]);
    const bounds = { from: 0, to: 12 };
    expect(d4RegionWindow(regions[0]!, bounds)).toEqual({ from: 0, to: 4 });
    expect(d4RegionWindow(regions[2]!, bounds)).toEqual({ from: 8, to: 12 });
    const p = every('octaves:G');
    expect(d4TargetsIn(p, regions[0]!)).toEqual([at(1, 3), at(3, 0), at(6, 3)]);
  });

  it('centres a single item on its dot, wide enough for any shape', () => {
    expect(d4ShapeWindow(single('octave:s6f5→s4'))).toEqual({ from: 2, to: 8 });
    expect(d4ShapeWindow(single('octave:s6f0→s4'))).toEqual({ from: 0, to: 6 });
    expect(d4ShapeWindow(single('octave:s4f12→s6'))).toEqual({ from: 6, to: 12 });
    for (const skillId of ['C1.octaves', 'C1.octaves-gb-shift', 'C1.double-octaves']) {
      for (const item of getSkill(skillId)!.items()) {
        const p = d4MakePrompt(item, ctx());
        const win = d4ShapeWindow(p);
        expect(p.targets[0]!.fret, item.id).toBeGreaterThanOrEqual(win.from);
        expect(p.targets[0]!.fret, item.id).toBeLessThanOrEqual(win.to);
      }
    }
  });
});
