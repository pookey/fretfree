import { describe, expect, it } from 'vitest';
import { ENGINE_CONFIG } from '../../engine/config';
import { DROP_D_TUNING, STANDARD_TUNING, type AccidentalPref, type Position } from '../../theory';
import type { DrillFeedback } from '../types';
import {
  D15_SCOPE,
  d15Above,
  d15CanTest,
  d15Check,
  d15ConceptOf,
  d15DescribeAnswer,
  d15Explain,
  d15FeedbackPositions,
  d15GradedResponseMs,
  d15InitialWindow,
  d15IsLive,
  d15MakePrompt,
  d15Named,
  d15NeckGuideLevel,
  d15PromptNotes,
  d15ScopeFor,
  d15Sounds,
  type D15Prompt,
} from './logic';

const ctx = {
  tuning: STANDARD_TUNING,
  accidentalPref: 'sharp' as AccidentalPref,
  scopeLevel: 0,
  rng: () => 0,
};
const item = (id: string) => ({ id, skillId: 'C2.all-notes' });
const prompt = (id: string, over: Partial<typeof ctx> = {}) =>
  d15MakePrompt(item(id), { ...ctx, ...over });
const at = (string: number, fret: number): Position => ({ string, fret });
const feedback = (p: D15Prompt, answer: Position): DrillFeedback<Position> => ({
  answer,
  result: d15Check(p, answer),
});

describe('D15 prompts', () => {
  it('tests find items only', () => {
    expect(d15CanTest(item('find:G@s5'))).toBe(true);
    expect(d15CanTest(item('note@s5f3'))).toBe(false);
    expect(() => prompt('note@s5f3')).toThrow(/cannot test/);
    expect(() => prompt('find:G@s7')).toThrow(/cannot test/);
  });

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
    expect(prompt('find:G@s5', { scopeLevel: 1 })).toMatchObject({
      scope: 'region',
      liveStrings: [1, 2, 3, 4, 5, 6],
    });
    expect(d15PromptNotes(p)).toEqual(['A2', 'G3']);
  });

  it("puts the open string's own note at fret 12, never in unison with the reference", () => {
    const p = prompt('find:A@s5');
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

  it('names the note while the guides are up, or whenever sound is off', () => {
    expect(d15Named(3, true)).toBe(true);
    expect(d15Named(2, true)).toBe(true);
    expect(d15Named(1, true)).toBe(false);
    expect(d15Named(0, true)).toBe(false);
    expect(d15Named(0, false)).toBe(true);
  });

  it('keys confusions by pitch class, as D2 does', () => {
    expect(d15ConceptOf(item('find:A#@s4'), { ...ctx, accidentalPref: 'flat' })).toBe('Bb');
    expect(d15ConceptOf(item('note@s4f1'), ctx)).toBeNull();
  });
});

describe('D15 grading', () => {
  const p = prompt('find:G@s5');

  it('accepts only the cell that sounds the note', () => {
    expect(d15Check(p, at(5, 10))).toEqual({ correct: true, expected: 'G' });
  });

  it('logs another note on the string as a confusion', () => {
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

  it('describes the tapped cell for the review log', () => {
    expect(d15DescribeAnswer(at(5, 10))).toBe('s5f10');
  });

  it('takes the listening time off by ear, not when the note is named', () => {
    const allowance = ENGINE_CONFIG.earFind.listenAllowanceMs;
    const byEar = { ...at(5, 10), byEar: true };
    expect(d15GradedResponseMs(p, byEar, allowance + 900)).toBe(900);
    expect(d15GradedResponseMs(p, byEar, 200)).toBe(0);
    expect(d15GradedResponseMs(p, { ...byEar, byEar: false }, 1500)).toBe(1500);
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
    // The view's answer also says whether it was by ear; only the cell is marked.
    expect(d15FeedbackPositions(p, feedback(p, { ...at(5, 7), byEar: true } as Position))).toEqual({
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

  it('opens the compact window at the nut, or on the note for a worked example', () => {
    const p = prompt('find:G@s5');
    expect(d15InitialWindow(p, false)).toEqual({ from: 0, to: 4 });
    expect(d15InitialWindow(p, true)).toEqual({ from: 8, to: 12 });
    expect(d15InitialWindow(p, false, 7)).toEqual({ from: 0, to: 6 });
  });
});
