import { describe, expect, it } from 'vitest';
import { findItemId, noteItemId, octaveItemId } from '../../engine/model';
import { DROP_D_TUNING, STANDARD_TUNING, type AccidentalPref, type Tuning } from '../../theory';
import type { DrillFeedback } from '../types';
import {
  D16_SCOPE,
  d16CanTest,
  d16Check,
  d16ConceptOf,
  d16DescribeAnswer,
  d16Explain,
  d16FeedbackPositions,
  d16GradedResponseMs,
  d16MakePrompt,
  d16MatchMode,
  d16ModeFor,
  d16ModeHint,
  d16NearestMidi,
  d16NeckGuideLevel,
  d16Sounds,
  d16Window,
  type D16Answer,
  type D16Prompt,
} from './logic';

const ctx = {
  tuning: STANDARD_TUNING,
  accidentalPref: 'sharp' as AccidentalPref,
  scopeLevel: 0,
  rng: () => 0,
};
const item = (id: string) => ({ id, skillId: 'F2.string6-naturals' });
const prompt = (id: string, scopeLevel = 0, over: Partial<typeof ctx> = {}) =>
  d16MakePrompt(item(id), { ...ctx, ...over, scopeLevel });
const played = (midi: number, name: string): D16Answer => ({ midi, name, cents: 0 });
const fb = (p: D16Prompt, answer: D16Answer): DrillFeedback<D16Answer> => ({
  answer,
  result: d16Check(p, answer),
});

const A2 = played(45, 'A2');
const A3 = played(57, 'A3');
const B2 = played(47, 'B2');

describe('d16 modes', () => {
  it('runs find items most forgiving first: pitch class, then the region', () => {
    expect(D16_SCOPE).toEqual({ minLevel: 0, maxLevel: 1 });
    expect(d16ModeFor(0)).toBe('pitch-class');
    expect(d16ModeFor(1)).toBe('region');
    expect(d16ModeFor(-3)).toBe('pitch-class');
    expect(d16ModeFor(9)).toBe('region');
    expect(prompt(findItemId('A', 6), 0).mode).toBe('pitch-class');
    expect(prompt(findItemId('A', 6), 1).mode).toBe('region');
  });

  it('runs octave shapes as any-position, whatever the scope', () => {
    expect(prompt(octaveItemId({ string: 6, fret: 5 }, 4), 0).mode).toBe('any-position');
    expect(prompt(octaveItemId({ string: 6, fret: 5 }, 4), 1).mode).toBe('any-position');
  });

  it('matches exactly except in pitch-class mode', () => {
    expect(d16MatchMode('pitch-class')).toBe('pitch-class');
    expect(d16MatchMode('region')).toBe('exact');
    expect(d16MatchMode('any-position')).toBe('exact');
  });
});

describe('d16CanTest / d16MakePrompt', () => {
  it('tests find items and octave shapes only', () => {
    expect(d16CanTest(item(findItemId('A', 6)))).toBe(true);
    expect(d16CanTest(item(octaveItemId({ string: 6, fret: 5 }, 4)))).toBe(true);
    expect(d16CanTest(item(noteItemId({ string: 6, fret: 5 })))).toBe(false);
    expect(() => prompt(noteItemId({ string: 6, fret: 5 }))).toThrow(/cannot test/);
  });

  it('finds the note on its string within frets 0–12', () => {
    const p = prompt(findItemId('A', 6), 1);
    expect(p).toMatchObject({ pc: 'A', string: 6, source: null, midis: [45] });
    expect(p.targets).toEqual([{ string: 6, fret: 5 }]);
    expect(p.activeRange).toEqual({ from: 0, to: 12 });
  });

  it("gives the open string's note both its pitches", () => {
    const p = prompt(findItemId('E', 6), 1);
    expect(p.targets).toEqual([
      { string: 6, fret: 0 },
      { string: 6, fret: 12 },
    ]);
    expect(p.midis).toEqual([40, 52]);
  });

  it('spells the note per the accidental preference', () => {
    expect(prompt(findItemId('C#', 5), 0, { accidentalPref: 'flat' }).pc).toBe('Db');
  });

  it('resolves an octave shape to its one pitch', () => {
    const p = prompt(octaveItemId({ string: 6, fret: 5 }, 4));
    expect(p).toMatchObject({ pc: 'A', string: 4, source: { string: 6, fret: 5 }, midis: [57] });
    expect(p.targets).toEqual([{ string: 4, fret: 7 }]);
    // Across the G–B shift: E on string 4, fret 2 → string 2, fret 5.
    expect(prompt(octaveItemId({ string: 4, fret: 2 }, 2)).targets).toEqual([
      { string: 2, fret: 5 },
    ]);
  });

  it('follows the tuning', () => {
    const p = prompt(findItemId('D', 6), 1, { tuning: DROP_D_TUNING });
    expect(p.targets).toEqual([
      { string: 6, fret: 0 },
      { string: 6, fret: 12 },
    ]);
    expect(p.midis).toEqual([38, 50]);
  });

  it('rejects a string the tuning lacks', () => {
    const bass: Tuning = { id: 'bass', name: 'Bass (EADG)', notes: ['E1', 'A1', 'D2', 'G2'] };
    expect(() => prompt(findItemId('A', 6), 0, { tuning: bass })).toThrow(/cannot test/);
    expect(() => prompt(octaveItemId({ string: 6, fret: 5 }, 4), 0, { tuning: bass })).toThrow(
      /cannot test/,
    );
  });
});

describe('d16Check', () => {
  it('pitch-class mode takes any octave of the note', () => {
    const p = prompt(findItemId('A', 6), 0);
    expect(d16Check(p, A2)).toEqual({ correct: true, expected: 'A' });
    expect(d16Check(p, A3).correct).toBe(true);
    expect(d16Check(p, played(81, 'A5')).correct).toBe(true);
  });

  it('region mode takes only the pitch on the named string', () => {
    const p = prompt(findItemId('A', 6), 1);
    expect(d16Check(p, A2).correct).toBe(true);
    expect(d16Check(p, A3)).toEqual({ correct: false, expected: 'A' });
    const e = prompt(findItemId('E', 6), 1);
    expect(d16Check(e, played(40, 'E2')).correct).toBe(true);
    expect(d16Check(e, played(52, 'E3')).correct).toBe(true);
    expect(d16Check(e, played(64, 'E4')).correct).toBe(false);
  });

  it('logs a wrong note as a confusion of the two notes', () => {
    const p = prompt(findItemId('A', 6), 1);
    expect(d16Check(p, B2)).toEqual({ correct: false, expected: 'A', confusedWith: 'B' });
    const flat = prompt(findItemId('A', 6), 1, { accidentalPref: 'flat' });
    expect(d16Check(flat, played(46, 'A#2')).confusedWith).toBe('Bb');
  });

  it('any-position mode takes only the octave, and logs no note confusion', () => {
    const p = prompt(octaveItemId({ string: 6, fret: 5 }, 4));
    expect(d16Check(p, A3).correct).toBe(true);
    expect(d16Check(p, A2)).toEqual({ correct: false, expected: 'A' });
    expect(d16Check(p, played(59, 'B3'))).toEqual({ correct: false, expected: 'A' });
  });
});

describe('d16 answers, timing and sounds', () => {
  it('logs the note heard', () => {
    expect(d16DescribeAnswer(played(54, 'F#3'))).toBe('F#3');
  });

  it('takes the mic latency and the play allowance off the response time', () => {
    const p = prompt(findItemId('A', 6));
    expect(d16GradedResponseMs(p, A2, 3000)).toBe(1850);
    expect(d16GradedResponseMs(p, A2, 400)).toBe(0);
  });

  it('plays nothing on a right answer, and the nearest right pitch then the played one on a wrong one', () => {
    const p = prompt(findItemId('E', 6), 1);
    expect(d16Sounds(p, fb(p, played(40, 'E2')))).toEqual({ expected: [] });
    expect(d16Sounds(p, fb(p, played(50, 'D3')))).toEqual({ expected: ['E3'], given: ['D3'] });
    expect(d16NearestMidi(p, 41)).toBe(40);
  });
});

describe('d16FeedbackPositions / d16Explain', () => {
  it('marks the right cells, and the played note when it is on the named string', () => {
    const p = prompt(findItemId('A', 6), 1);
    expect(d16FeedbackPositions(p, fb(p, A2))).toEqual({
      expected: [{ string: 6, fret: 5 }],
      given: [],
    });
    expect(d16FeedbackPositions(p, fb(p, B2)).given).toEqual([{ string: 6, fret: 7 }]);
    // Off the string's frets 0–12: nothing to mark.
    expect(d16FeedbackPositions(p, fb(p, played(76, 'E5'))).given).toEqual([]);
    expect(d16FeedbackPositions(p, fb(p, played(30, 'F#1'))).given).toEqual([]);
  });

  it('says where the note is, and what was heard when it differs', () => {
    const region = prompt(findItemId('A', 6), 1);
    expect(d16Explain(region, fb(region, A2))).toBe('A is at fret 5 on string 6.');
    expect(d16Explain(region, fb(region, B2))).toBe('You played B2. A is at fret 5 on string 6.');
    const pc = prompt(findItemId('A', 6), 0);
    expect(d16Explain(pc, fb(pc, A3))).toBe(
      'You played A3. Any A counts. A is at fret 5 on string 6.',
    );
    const e = prompt(findItemId('E', 6), 1);
    expect(d16Explain(e, fb(e, played(40, 'E2')))).toBe('E is at frets 0 and 12 on string 6.');
    const oct = prompt(octaveItemId({ string: 6, fret: 5 }, 4));
    expect(d16Explain(oct, fb(oct, A2))).toBe(
      'You played A2. The octave of A on string 6, fret 5 is at fret 7 on string 4.',
    );
  });

  it('says what each mode lets count', () => {
    expect(d16ModeHint(prompt(findItemId('A', 6), 0))).toBe('Any A counts, in any octave.');
    expect(d16ModeHint(prompt(findItemId('A', 6), 1))).toMatch(/^Frets 0–12\. The mic hears/);
    expect(d16ModeHint(prompt(octaveItemId({ string: 6, fret: 5 }, 4)))).toMatch(
      /same note on another string counts/,
    );
  });
});

describe('d16ConceptOf', () => {
  it('keys find items by pitch class and octave shapes as D4 does', () => {
    expect(d16ConceptOf(item(findItemId('C#', 5)), ctx)).toBe('C#');
    expect(d16ConceptOf(item(findItemId('C#', 5)), { ...ctx, accidentalPref: 'flat' })).toBe('Db');
    expect(d16ConceptOf(item(octaveItemId({ string: 6, fret: 5 }, 4)), ctx)).toBe(
      '2 strings up, 2 frets higher',
    );
  });
});

describe('d16NeckGuideLevel', () => {
  const answered = { guided: false, answered: true };
  const open = { guided: false, answered: false };

  it('drops to inlays when an open-string name would place the answer', () => {
    const e = prompt(findItemId('E', 6));
    expect(d16NeckGuideLevel(e, 3, open)).toBe(1);
    expect(d16NeckGuideLevel(e, 3, answered)).toBe(3);
    expect(d16NeckGuideLevel(e, 3, { guided: true, answered: false })).toBe(3);
    expect(d16NeckGuideLevel(e, 1, open)).toBe(1);
    expect(d16NeckGuideLevel(prompt(findItemId('C', 5)), 2, open)).toBe(2);
  });
});

describe('d16Window', () => {
  it('starts at the nut, giving nothing away', () => {
    const p = prompt(findItemId('A', 6));
    expect(d16Window(p, { reveal: false, size: 5 })).toEqual({ from: 0, to: 4 });
  });

  it('centres on the answer when revealed', () => {
    const p = prompt(findItemId('C', 5));
    expect(d16Window(p, { reveal: true, size: 5 })).toEqual({ from: 1, to: 5 });
    // Both of E's frets: wide enough for 0 and 12.
    const e = prompt(findItemId('E', 6));
    expect(d16Window(e, { reveal: true, size: 5 })).toEqual({ from: 0, to: 12 });
  });

  it("keeps an octave shape's dot in view", () => {
    const p = prompt(octaveItemId({ string: 6, fret: 10 }, 4));
    expect(d16Window(p, { reveal: false, size: 5 })).toEqual({ from: 8, to: 12 });
    expect(d16Window(p, { reveal: true, size: 5 })).toEqual({ from: 8, to: 12 });
  });
});
