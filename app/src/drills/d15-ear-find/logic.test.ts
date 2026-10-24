import { describe, expect, it } from 'vitest';
import { ENGINE_CONFIG } from '../../engine/config';
import { DROP_D_TUNING, STANDARD_TUNING, type AccidentalPref, type Position } from '../../theory';
import { computeGeometry } from '../../components/fretboard/geometry';
import type { DrillFeedback } from '../types';
import {
  D15_SCOPE,
  d15Above,
  d15CanTest,
  d15CardOf,
  d15Check,
  d15ConceptOf,
  d15DescribeAnswer,
  d15Explain,
  d15FeedbackPositions,
  d15GradedResponseMs,
  d15FeedbackWindow,
  d15InitialWindow,
  d15IsLive,
  d15MakePrompt,
  d15NeckGuideLevel,
  d15PromptNotes,
  d15ScopeFor,
  d15SideFrets,
  d15Sounds,
  D15_SIDE_CHROME_X,
  D15_SIDE_CHROME_Y,
  type D15Prompt,
} from './logic';

const ctx = {
  tuning: STANDARD_TUNING,
  accidentalPref: 'sharp' as AccidentalPref,
  scopeLevel: 0,
  rng: () => 0,
};
const item = (id: string) => ({
  id,
  skillId: id.startsWith('ear-') ? 'I6.ear-find' : 'C2.all-notes',
});
const prompt = (id: string, over: Partial<typeof ctx> = {}) =>
  d15MakePrompt(item(id), { ...ctx, ...over });
const at = (string: number, fret: number): Position => ({ string, fret });
const feedback = (p: D15Prompt, answer: Position): DrillFeedback<Position> => ({
  answer,
  result: d15Check(p, answer),
});

describe('D15 cards', () => {
  it('tests C2 find cards named and I6 ear-find cards by ear', () => {
    expect(d15CanTest(item('find:G@s5'))).toBe(true);
    expect(d15CanTest(item('ear-find:G@s5'))).toBe(true);
    expect(d15CanTest(item('note@s5f3'))).toBe(false);
    expect(d15CardOf(item('find:G@s5'))).toEqual({ pc: 'G', string: 5, byEar: false });
    expect(d15CardOf(item('ear-find:G@s5'))).toEqual({ pc: 'G', string: 5, byEar: true });
    expect(() => prompt('note@s5f3')).toThrow(/cannot test/);
    expect(() => prompt('find:G@s7')).toThrow(/cannot test/);
    expect(prompt('find:G@s5').byEar).toBe(false);
    expect(prompt('ear-find:G@s5').byEar).toBe(true);
  });

  it('keys named cards by pitch class, as D2 does, and ear cards by interval', () => {
    expect(d15ConceptOf(item('find:A#@s4'), { ...ctx, accidentalPref: 'flat' })).toBe('Bb');
    expect(d15ConceptOf(item('ear-find:G@s4'), ctx)).toBe('ear:P4');
    expect(d15ConceptOf(item('ear-find:A@s5'), ctx)).toBe('ear:P8');
    expect(d15ConceptOf(item('ear-find:E@s6'), { ...ctx, tuning: DROP_D_TUNING })).toBe('ear:M2');
    expect(d15ConceptOf(item('ear-find:G@s7'), ctx)).toBeNull();
    expect(d15ConceptOf(item('note@s4f1'), ctx)).toBeNull();
  });
});

describe('D15 prompts', () => {
  it('plays the open string, then the note above it on that string', () => {
    const p = prompt('find:G@s5');
    expect(p).toMatchObject({
      pc: 'G',
      string: 5,
      scope: 'string',
      target: at(5, 10),
      reference: at(5, 0),
      activeRange: { from: 0, to: 12 },
      liveStrings: [5],
    });
    expect(d15PromptNotes(p)).toEqual(['A2', 'G3']);
    expect(prompt('find:G@s5', { scopeLevel: 1 })).toMatchObject({
      scope: 'region',
      liveStrings: [1, 2, 3, 4, 5, 6],
    });
  });

  it("puts the open string's own note at fret 12, never in unison with the reference", () => {
    const p = prompt('ear-find:A@s5');
    expect(p.target).toEqual(at(5, 12));
    expect(d15PromptNotes(p)).toEqual(['A2', 'A3']);
  });

  it('spells the note per the accidental preference and follows the tuning', () => {
    expect(prompt('find:A#@s3', { accidentalPref: 'flat' })).toMatchObject({
      pc: 'Bb',
      target: at(3, 3),
    });
    expect(prompt('find:E@s6', { tuning: DROP_D_TUNING }).target).toEqual(at(6, 2));
  });

  it('maps scope levels to one string, then every string, clamped', () => {
    expect(D15_SCOPE).toEqual({ minLevel: 0, maxLevel: 1 });
    expect(d15ScopeFor(-1)).toBe('string');
    expect(d15ScopeFor(0)).toBe('string');
    expect(d15ScopeFor(1)).toBe('region');
    expect(d15ScopeFor(7)).toBe('region');
  });
});

describe('D15 grading a named card', () => {
  const p = prompt('find:G@s5');

  it('accepts only the cell that sounds the note', () => {
    expect(d15Check(p, at(5, 10))).toEqual({ correct: true, expected: 'G' });
  });

  it('logs another note on the string as a pitch-class confusion', () => {
    expect(d15Check(p, at(5, 8))).toEqual({ correct: false, expected: 'G', confusedWith: 'F' });
  });

  it('marks the same pitch class an octave off, or an inert cell, wrong with no confusion', () => {
    const octave = prompt('find:A@s5');
    expect(d15Check(octave, at(5, 0))).toEqual({ correct: false, expected: 'A' });
    expect(d15IsLive(p, at(4, 5))).toBe(false);
    expect(d15Check(p, at(4, 3))).toEqual({ correct: false, expected: 'G' });
    expect(d15IsLive(p, at(5, 13))).toBe(false);
    expect(d15IsLive(p, at(5, 0))).toBe(true);
  });

  it('with every string live, marks the note on another string wrong as a place error', () => {
    const wide = prompt('find:G@s5', { scopeLevel: 1 });
    // G3 at s4f5 is the very pitch heard, but not on the string asked for.
    expect(d15IsLive(wide, at(4, 5))).toBe(true);
    expect(d15Check(wide, at(4, 5))).toEqual({ correct: false, expected: 'G' });
    expect(d15Check(wide, at(4, 3))).toEqual({ correct: false, expected: 'G', confusedWith: 'F' });
  });

  it('is graded like D2, with no listening allowance', () => {
    expect(d15GradedResponseMs(p, at(5, 10), 1500)).toBe(1500);
  });
});

describe('D15 grading by ear', () => {
  const p = prompt('ear-find:G@s4');
  const wide = prompt('ear-find:G@s4', { scopeLevel: 1 });
  const place = { correct: false, expected: 'G', concept: 'ear:P4' };

  it('keys the answer by its interval over the open string', () => {
    expect(d15Check(p, at(4, 5))).toEqual({ correct: true, expected: 'G', concept: 'ear:P4' });
  });

  it('logs a wrong fret on the string as an interval confusion', () => {
    expect(d15Check(p, at(4, 4))).toEqual({ ...place, confusedWith: 'ear:M3' });
  });

  it('counts the reference, an octave off or another string as place errors', () => {
    expect(d15Check(p, at(4, 0))).toEqual(place);
    expect(d15Check(p, at(3, 0))).toEqual(place);
    expect(d15Check(wide, at(3, 0))).toEqual(place);
    expect(d15Check(wide, at(5, 7))).toEqual(place);
    expect(d15Check(prompt('ear-find:G@s3'), at(3, 0))).toEqual({
      correct: false,
      expected: 'G',
      concept: 'ear:P8',
    });
  });

  it('takes the listening time off before grading', () => {
    const allowance = ENGINE_CONFIG.earFind.listenAllowanceMs;
    expect(d15GradedResponseMs(p, at(4, 5), allowance + 900)).toBe(900);
    expect(d15GradedResponseMs(p, at(4, 5), 200)).toBe(0);
  });

  it('describes the tapped cell for the review log', () => {
    expect(d15DescribeAnswer(at(4, 5))).toBe('s4f5');
  });
});

describe('D15 feedback', () => {
  const p = prompt('find:G@s5');

  it('plays the note again when right, then the tapped note when wrong', () => {
    expect(d15Sounds(p, feedback(p, at(5, 10)))).toEqual({ expected: ['G3'] });
    expect(d15Sounds(p, feedback(p, at(5, 7)))).toEqual({ expected: ['G3'], given: ['E3'] });
  });

  it('marks the right cell, and the tapped one when wrong', () => {
    expect(d15FeedbackPositions(p, feedback(p, at(5, 10)))).toEqual({
      expected: [at(5, 10)],
      given: [],
    });
    expect(d15FeedbackPositions(p, feedback(p, at(5, 7)))).toEqual({
      expected: [at(5, 10)],
      given: [at(5, 7)],
    });
  });

  it('says how the note sits over the open string, and how far off a tap was', () => {
    expect(d15Above(p)).toBe('minor 7th above the open A');
    expect(d15Above(prompt('find:A@s5'))).toBe('perfect octave above the open A');
    expect(d15Explain(p, feedback(p, at(5, 10)))).toBe(
      'G is at fret 10 on string 5, a minor 7th above the open A.',
    );
    expect(d15Explain(p, feedback(p, at(5, 8)))).toBe(
      'You tapped F (fret 8), 2 frets too low. G is at fret 10 on string 5, a minor 7th above the open A.',
    );
    expect(d15Explain(p, feedback(p, at(5, 11)))).toBe(
      'You tapped G# (fret 11), 1 fret too high. G is at fret 10 on string 5, a minor 7th above the open A.',
    );
    expect(d15Explain(p, feedback(p, at(4, 5)))).toBe(
      'You tapped G (the same note, on another string). G is at fret 10 on string 5, a minor 7th above the open A.',
    );
    expect(d15Explain(p, feedback(p, at(4, 3)))).toBe(
      'You tapped F (string 4, fret 3). G is at fret 10 on string 5, a minor 7th above the open A.',
    );
  });
});

describe('D15 neck guides', () => {
  it('drops to inlays only when an open-string name would name the note', () => {
    const g = prompt('find:G@s5');
    const f = prompt('find:F@s5');
    const answered = { guided: false, answered: true };
    const open = { guided: false, answered: false };
    expect(d15NeckGuideLevel(g, 3, open)).toBe(1);
    expect(d15NeckGuideLevel(f, 3, open)).toBe(3);
    expect(d15NeckGuideLevel(g, 1, open)).toBe(1);
    expect(d15NeckGuideLevel(g, 0, open)).toBe(0);
    expect(d15NeckGuideLevel(g, 3, answered)).toBe(3);
    expect(d15NeckGuideLevel(g, 0, { guided: true, answered: false })).toBe(3);
  });

  it('keeps an ear card at its guide level, whatever the note', () => {
    const open = { guided: false, answered: false };
    // G is string 3's open note, but by ear there is no name to give away.
    expect(d15NeckGuideLevel(prompt('ear-find:G@s5'), 3, open)).toBe(3);
    expect(d15NeckGuideLevel(prompt('ear-find:F@s5'), 2, open)).toBe(2);
  });

  it('opens the compact window at the nut, or on the note for a worked example', () => {
    const p = prompt('find:G@s5');
    expect(d15InitialWindow(p, false)).toEqual({ from: 0, to: 4 });
    expect(d15InitialWindow(p, true)).toEqual({ from: 8, to: 12 });
    expect(d15InitialWindow(p, false, 7)).toEqual({ from: 0, to: 6 });
  });

  it('opens a worked example at the nut when its note fits there, so the reference shows', () => {
    // A on string 6 is fret 5: a 10-fret window from the nut holds it.
    const p = prompt('ear-find:A@s6');
    expect(p.target.fret).toBe(5);
    expect(d15InitialWindow(p, true, 10)).toEqual({ from: 0, to: 9 });
    expect(d15InitialWindow(p, true, 5)).toEqual({ from: 3, to: 7 });
  });

  it('keeps the prompt window for feedback when it shows both cells', () => {
    const bounds = { from: 0, to: 15 };
    const win = { from: 1, to: 10 };
    expect(d15FeedbackWindow(win, [3, 5], bounds)).toBe(win);
    // A tap outside the window widens to show both, at the window's size or more.
    expect(d15FeedbackWindow({ from: 0, to: 4 }, [2, 7], bounds)).toEqual({ from: 2, to: 7 });
    expect(d15FeedbackWindow({ from: 0, to: 4 }, [0, 12], bounds)).toEqual({ from: 0, to: 12 });
  });

  it('sizes the window beside the prompt on a phone on its side', () => {
    // iPhone 15 on its side in Safari (734 × 343 inside the safe areas): 8 frets.
    expect(d15SideFrets(734, 343)).toBe(8);
    // Installed (734 × 393): taller cells, so fewer frets fit beside the prompt.
    expect(d15SideFrets(734, 393)).toBe(6);
    // Each window it allows leaves the prompt its column.
    for (const [w, h] of [
      [734, 343],
      [734, 393],
      [812, 428],
      [568, 320],
    ] as const) {
      const frets = d15SideFrets(w, h);
      const scale =
        (h - D15_SIDE_CHROME_Y) /
        computeGeometry({ fretRange: { from: 0, to: 0 }, stringCount: 6, handedness: 'right' })
          .height;
      const neck = computeGeometry({
        fretRange: { from: 0, to: frets - 1 },
        stringCount: 6,
        handedness: 'right',
      });
      if (frets > 5) expect(neck.width * scale).toBeLessThanOrEqual(w - D15_SIDE_CHROME_X);
      expect(frets).toBeGreaterThanOrEqual(5);
    }
    // No room at all still gets the portrait window.
    expect(d15SideFrets(300, 200)).toBe(5);
    // A very wide screen tops out at the whole neck.
    expect(d15SideFrets(4000, 499)).toBe(16);
  });
});
