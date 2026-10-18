import { describe, expect, it } from 'vitest';
import { SKILLS } from '../../engine/skills';
import { DROP_D_TUNING, STANDARD_TUNING, chromaOf, type AccidentalPref } from '../../theory';
import type { DrillContext, DrillFeedback } from '../types';
import {
  d3AnswerPc,
  d3CanTest,
  d3Check,
  d3Choices,
  d3ConceptOf,
  d3DescribeAnswer,
  d3FeedbackPositions,
  d3GivenPosition,
  d3KeyToAnswer,
  d3MakePrompt,
  d3Question,
  d3Sounds,
  d3TapAnswer,
  d3WorkedExample,
  type D3Answer,
  type D3Prompt,
} from './logic';

const ctx = (over: Partial<DrillContext> = {}): DrillContext => ({
  tuning: STANDARD_TUNING,
  accidentalPref: 'sharp',
  scopeLevel: 0,
  rng: () => 0,
  ...over,
});

const make = (id: string, over: Partial<DrillContext> = {}) =>
  d3MakePrompt({ id, skillId: 'F1.test' }, ctx(over));

function fb(prompt: D3Prompt, answer: D3Answer): DrillFeedback<D3Answer> {
  return { answer, result: d3Check(prompt, answer) };
}

describe('D3 prompts', () => {
  it('tests step and letter items only', () => {
    expect(d3CanTest({ id: 'step:+2@E', skillId: 's' })).toBe(true);
    expect(d3CanTest({ id: 'letter:-1@C', skillId: 's' })).toBe(true);
    expect(d3CanTest({ id: 'note@s6f5', skillId: 's' })).toBe(false);
    expect(() => make('note@s6f5')).toThrow(/cannot test/);
  });

  it('asks "a whole step above E?" and draws it on the low E string', () => {
    const p = make('step:+2@E');
    expect(p.question).toBe('A whole step above E?');
    expect(p.expectedPc).toBe('F#');
    expect(p.semitones).toBe(2);
    expect(p.fromPosition).toEqual({ string: 6, fret: 0 });
    expect(p.expectedPosition).toEqual({ string: 6, fret: 2 });
    expect([p.fromName, p.expectedName]).toEqual(['E2', 'F#2']);
  });

  it('spells answers with the accidental preference', () => {
    expect(make('step:+2@E', { accidentalPref: 'flat' }).expectedPc).toBe('Gb');
    expect(make('step:-2@F').expectedPc).toBe('D#');
    expect(make('step:-2@F', { accidentalPref: 'flat' }).expectedPc).toBe('Eb');
    expect(make('step:+1@C', { accidentalPref: 'flat' }).expectedPc).toBe('Db');
  });

  it('has no sharp between B–C and E–F', () => {
    expect(make('step:+1@E').expectedPc).toBe('F');
    expect(make('step:+1@B').expectedPc).toBe('C');
    expect(make('step:-1@C').expectedPc).toBe('B');
    expect(make('step:-1@F', { accidentalPref: 'flat' }).expectedPc).toBe('E');
  });

  it('moves up the octave when a step down would fall off the nut', () => {
    const p = make('step:-2@E');
    expect(p.question).toBe('A whole step below E?');
    expect(p.fromPosition.fret).toBe(12);
    expect(p.expectedPosition.fret).toBe(10);
    expect(p.expectedName).toBe('D3');
    expect(make('step:-1@E').expectedPosition.fret).toBe(11);
  });

  it('walks the musical alphabet for letter items', () => {
    const cases: [string, string, number, string][] = [
      ['letter:+1@G', 'A', 2, 'The note after G in the musical alphabet?'],
      ['letter:+1@B', 'C', 1, 'The note after B in the musical alphabet?'],
      ['letter:-1@C', 'B', -1, 'The note before C in the musical alphabet?'],
      ['letter:-1@A', 'G', -2, 'The note before A in the musical alphabet?'],
      ['letter:+2@E', 'G', 3, '2 notes after E in the musical alphabet?'],
      ['letter:-3@D', 'A', -5, '3 notes before D in the musical alphabet?'],
    ];
    for (const [id, pc, semitones, question] of cases) {
      const p = make(id);
      expect([p.expectedPc, p.semitones, p.question], id).toEqual([pc, semitones, question]);
      expect(p.choices).toEqual(['C', 'D', 'E', 'F', 'G', 'A', 'B']);
      // Learner-facing copy says "note", never "letter" (M1-27).
      expect(p.question).not.toMatch(/letter/i);
    }
  });

  it('names larger steps in half steps', () => {
    expect(d3Question('step', 'E', 3)).toBe('3 half steps above E?');
    expect(d3Question('step', 'E', -1)).toBe('A half step below E?');
  });

  it('writes the worked example from the question', () => {
    expect(d3WorkedExample(make('step:+2@E'))).toBe('A whole step above E is F#.');
    expect(d3WorkedExample(make('letter:+1@G'))).toBe(
      'The note after G in the musical alphabet is A.',
    );
  });

  it('narrows step choices to a window around the start at scope 0', () => {
    expect(make('step:+2@E').choices).toEqual(['C#', 'D', 'D#', 'E', 'F', 'F#', 'G']);
    expect(make('step:-1@C', { accidentalPref: 'flat' }).choices).toEqual([
      'A',
      'Bb',
      'B',
      'C',
      'Db',
      'D',
      'Eb',
    ]);
    expect(make('step:+2@E', { scopeLevel: 1 }).choices).toHaveLength(12);
    expect(d3Choices('letter', 0, 1, 'sharp')).toHaveLength(7);
  });

  it('serves every F1 item with a correctly spelled answer among the choices', () => {
    const items = SKILLS.filter((s) => s.topic === 'F1').flatMap((s) => s.items());
    expect(items.length).toBeGreaterThan(40);
    for (const item of items) {
      expect(d3CanTest(item), item.id).toBe(true);
      for (const accidentalPref of ['sharp', 'flat'] as AccidentalPref[]) {
        for (const scopeLevel of [0, 1]) {
          const p = d3MakePrompt(item, ctx({ accidentalPref, scopeLevel }));
          expect(p.choices, item.id).toContain(p.expectedPc);
          expect(['E#', 'B#', 'Cb', 'Fb'], item.id).not.toContain(p.expectedPc);
          expect(p.expectedPc).toMatch(accidentalPref === 'sharp' ? /^[A-G]#?$/ : /^[A-G]b?$/);
          expect(p.expectedPosition.fret).toBeGreaterThanOrEqual(0);
          expect(p.expectedPosition.fret).toBeLessThanOrEqual(15);
          expect(chromaOf(p.expectedPc)).toBe((chromaOf(p.from) + p.semitones + 120) % 12);
        }
      }
    }
  });

  it('follows the tuning of the drawn string', () => {
    const p = make('step:-1@E', { tuning: DROP_D_TUNING });
    expect(p.fromPosition.fret).toBe(2);
    expect(p.expectedPosition.fret).toBe(1);
  });
});

describe('D3 checking and feedback', () => {
  it('accepts the answer or its enharmonic, and records the confusion', () => {
    const p = make('step:+2@E');
    expect(d3Check(p, 'F#')).toEqual({ correct: true, expected: 'F#' });
    expect(d3Check(p, 'Gb').correct).toBe(true);
    expect(d3Check(p, 'F')).toEqual({ correct: false, expected: 'F#', confusedWith: 'F' });
    expect(d3Check(p, 'H').correct).toBe(false);
  });

  it('places a wrong answer on the same side of the start', () => {
    expect(d3GivenPosition(make('step:+2@E'), 'G')).toEqual({ string: 6, fret: 3 });
    // A half step below C (fret 8): A is three frets down, not nine up.
    expect(d3GivenPosition(make('step:-1@C'), 'A')).toEqual({ string: 6, fret: 5 });
    // C# only fits above.
    expect(d3GivenPosition(make('step:-1@C'), 'C#')).toEqual({ string: 6, fret: 9 });
    expect(d3GivenPosition(make('step:-1@C'), 'X')).toBeNull();
  });

  it('plays the start then the answer, and the chosen note when wrong', () => {
    const p = make('step:+2@E');
    expect(d3Sounds(p, fb(p, 'F#'))).toEqual({ expected: ['E2', 'F#2'] });
    expect(d3Sounds(p, fb(p, 'G'))).toEqual({ expected: ['E2', 'F#2'], given: ['G2'] });
    expect(d3Sounds(p, fb(p, 'X'))).toEqual({ expected: ['E2', 'F#2'] });
    const flat = make('step:-2@F', { accidentalPref: 'flat' });
    expect(d3Sounds(flat, fb(flat, 'Db')).given).toEqual(['Db3']);
  });

  it('shows the answer, and the wrong choice, on the neck', () => {
    const p = make('step:+1@E');
    expect(d3FeedbackPositions(p, fb(p, 'F'), STANDARD_TUNING)).toEqual({
      expected: [{ string: 6, fret: 1 }],
      given: [],
    });
    expect(d3FeedbackPositions(p, fb(p, 'F#'), STANDARD_TUNING).given).toEqual([
      { string: 6, fret: 2 },
    ]);
    expect(d3FeedbackPositions(p, fb(p, '?'), STANDARD_TUNING).given).toEqual([]);
  });
});

describe('D3 neck taps', () => {
  const tap = (string: number, fret: number, accidentalPref: AccidentalPref = 'sharp') =>
    d3TapAnswer({ string, fret }, STANDARD_TUNING, accidentalPref);

  it('names the tapped cell with the preference', () => {
    expect(tap(3, 0)).toEqual({ position: { string: 3, fret: 0 }, pc: 'G', name: 'G3' });
    expect(tap(6, 2, 'flat')).toMatchObject({ pc: 'Gb', name: 'Gb2' });
    expect(d3TapAnswer({ string: 6, fret: 0 }, DROP_D_TUNING, 'sharp').pc).toBe('D');
    expect(d3AnswerPc(tap(1, 1))).toBe('F');
    expect(d3AnswerPc('C#')).toBe('C#');
  });

  it('counts a tap on any cell of the answer note, like its button', () => {
    const p = make('step:+2@E');
    for (const [s, f] of [
      [6, 2],
      [6, 14],
      [4, 4],
      [1, 2],
    ] as const) {
      expect(d3Check(p, tap(s, f)), `s${s}f${f}`).toEqual(d3Check(p, 'F#'));
    }
    expect(d3Check(p, tap(6, 2, 'flat'))).toEqual({ correct: true, expected: 'F#' });
    expect(d3Check(p, tap(3, 0))).toEqual(d3Check(p, 'G'));
  });

  it('accepts only the natural for musical-alphabet items', () => {
    const p = make('letter:+1@E');
    expect(d3Check(p, tap(6, 1)).correct).toBe(true);
    // The sharp a fret above F is wrong, as is any sharp or flat cell.
    expect(d3Check(p, tap(6, 2))).toEqual({ correct: false, expected: 'F', confusedWith: 'F#' });
    expect(d3Check(p, tap(5, 1)).correct).toBe(false);
    // An enharmonic spelling of a natural (E♯ for F) is not the natural.
    expect(d3Check(p, 'E#').correct).toBe(false);
    expect(d3Check(make('step:+1@E'), 'E#').correct).toBe(true);
  });

  it('marks a wrong tap and the answer on the tapped string, nearest the tap', () => {
    const p = make('step:+2@E');
    // String 3 fret 0 is G; its only F# on frets 0–15 is fret 11.
    expect(d3FeedbackPositions(p, fb(p, tap(3, 0)), STANDARD_TUNING)).toEqual({
      expected: [
        { string: 6, fret: 2 },
        { string: 3, fret: 11 },
      ],
      given: [{ string: 3, fret: 0 }],
    });
    // String 1 fret 3 is G: F# is fret 2, the neighbouring cell.
    expect(d3FeedbackPositions(p, fb(p, tap(1, 3)), STANDARD_TUNING).expected[1]).toEqual({
      string: 1,
      fret: 2,
    });
    // Within the drawn window only: on frets 3–7 string 1 has no F#.
    expect(
      d3FeedbackPositions(p, fb(p, tap(1, 3)), STANDARD_TUNING, { from: 3, to: 7 }).expected,
    ).toEqual([{ string: 6, fret: 2 }]);
  });

  it('marks a right tap as the answer, without repeating the drawn step', () => {
    const p = make('step:+2@E');
    expect(d3FeedbackPositions(p, fb(p, tap(4, 4)), STANDARD_TUNING)).toEqual({
      expected: [
        { string: 6, fret: 2 },
        { string: 4, fret: 4 },
      ],
      given: [],
    });
    expect(d3FeedbackPositions(p, fb(p, tap(6, 2)), STANDARD_TUNING)).toEqual({
      expected: [{ string: 6, fret: 2 }],
      given: [],
    });
  });

  it('plays the tapped note when wrong, and records the cell', () => {
    const p = make('step:+2@E');
    expect(d3Sounds(p, fb(p, tap(3, 0)))).toEqual({ expected: ['E2', 'F#2'], given: ['G3'] });
    expect(d3Sounds(p, fb(p, tap(1, 2)))).toEqual({ expected: ['E2', 'F#2'] });
    expect(d3DescribeAnswer(tap(3, 0))).toBe('G@s3f0');
    expect(d3DescribeAnswer('G')).toBe('G');
  });

  it('keys the confusion matrix by the answer note', () => {
    const c = { tuning: STANDARD_TUNING, accidentalPref: 'sharp' as const };
    expect(d3ConceptOf({ id: 'step:+2@E', skillId: 's' }, c)).toBe('F#');
    expect(d3ConceptOf({ id: 'letter:-1@C', skillId: 's' }, c)).toBe('B');
    expect(d3ConceptOf({ id: 'step:+2@E', skillId: 's' }, { ...c, accidentalPref: 'flat' })).toBe(
      'Gb',
    );
    expect(d3ConceptOf({ id: 'note@s6f1', skillId: 's' }, c)).toBeNull();
  });
});

describe('D3 keyboard', () => {
  const sharp = ['C#', 'D', 'D#', 'E', 'F', 'F#', 'G'];
  const flat = ['Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G'];

  it('maps A–G, Shift for accidentals, and 1–9 to buttons', () => {
    expect(d3KeyToAnswer('f', false, sharp, 'sharp')).toBe('F');
    expect(d3KeyToAnswer('F', true, sharp, 'sharp')).toBe('F#');
    expect(d3KeyToAnswer('G', true, flat, 'flat')).toBe('Gb');
    expect(d3KeyToAnswer('2', false, sharp, 'sharp')).toBe('D');
    expect(d3KeyToAnswer('9', false, sharp, 'sharp')).toBeNull();
  });

  it('ignores keys that are not an offered, correctly spelled note', () => {
    expect(d3KeyToAnswer('a', false, sharp, 'sharp')).toBeNull();
    expect(d3KeyToAnswer('E', true, sharp, 'sharp')).toBeNull();
    expect(d3KeyToAnswer('F', true, flat, 'flat')).toBeNull();
    expect(d3KeyToAnswer('x', false, sharp, 'sharp')).toBeNull();
    expect(d3KeyToAnswer('G', true, sharp, 'sharp')).toBeNull();
  });
});
