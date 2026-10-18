import { describe, expect, it } from 'vitest';
import { DROP_D_TUNING, STANDARD_TUNING, type Position } from '../../theory';
import type { DrillFeedback } from '../types';
import {
  D2_SCOPE,
  d2CanTest,
  d2Check,
  d2ConceptOf,
  d2DescribeAnswer,
  d2Explain,
  d2FeedbackPositions,
  d2InitialFocus,
  d2InitialWindow,
  d2IsLive,
  d2MakePrompt,
  d2MoveFocus,
  d2NearestTarget,
  d2NeckGuideLevel,
  d2ScopeFor,
  d2SlideWindow,
  d2Sounds,
  d2SpanWindow,
  d2WindowContaining,
  intersectRange,
  type D2Prompt,
} from './logic';

const ctx = {
  tuning: STANDARD_TUNING,
  accidentalPref: 'sharp' as const,
  scopeLevel: 0,
  rng: () => 0,
};
const item = (id: string) => ({ id, skillId: 'F2.string5-naturals' });
const prompt = (id: string, scopeLevel = 0, over: Partial<typeof ctx> = {}) =>
  d2MakePrompt(item(id), { ...ctx, ...over, scopeLevel });
const at = (string: number, fret: number): Position => ({ string, fret });
const feedback = (p: D2Prompt, answer: Position): DrillFeedback<Position> => ({
  answer,
  result: d2Check(p, answer),
});

describe('D2 prompts', () => {
  it('tests find items only', () => {
    expect(d2CanTest(item('find:G@s5'))).toBe(true);
    expect(d2CanTest(item('note@s5f3'))).toBe(false);
    expect(() => prompt('note@s5f3')).toThrow(/cannot test/);
    expect(() => prompt('find:G@s7')).toThrow(/cannot test/);
  });

  it('builds a one-string prompt at the narrowest scope', () => {
    const p = prompt('find:G@s5');
    expect(p).toMatchObject({
      pc: 'G',
      string: 5,
      scope: 'string',
      activeRange: { from: 0, to: 12 },
      liveStrings: [5],
      targets: [at(5, 10)],
    });
  });

  it('widens to every string, then to the whole neck', () => {
    const region = prompt('find:G@s5', 1);
    expect(region.scope).toBe('region');
    expect(region.liveStrings).toEqual([1, 2, 3, 4, 5, 6]);
    expect(region.targets).toEqual([at(5, 10)]);
    const neck = prompt('find:C@s5', 2);
    expect(neck.scope).toBe('neck');
    expect(neck.activeRange).toEqual({ from: 0, to: 15 });
    expect(neck.targets).toEqual([at(5, 3), at(5, 15)]);
  });

  it('maps and clamps scope levels', () => {
    expect(D2_SCOPE).toEqual({ minLevel: 0, maxLevel: 2 });
    expect(d2ScopeFor(-1)).toBe('string');
    expect(d2ScopeFor(1)).toBe('region');
    expect(d2ScopeFor(9)).toBe('neck');
  });

  it('finds every octave repeat within the active range', () => {
    expect(prompt('find:E@s6').targets).toEqual([at(6, 0), at(6, 12)]);
  });

  it('spells accidentals with the preference and follows the tuning', () => {
    const p = prompt('find:C#@s3', 0, { accidentalPref: 'flat' });
    expect(p.pc).toBe('Db');
    expect(p.targets).toEqual([at(3, 6)]);
    expect(prompt('find:D@s6', 0, { tuning: DROP_D_TUNING }).targets).toEqual([
      at(6, 0),
      at(6, 12),
    ]);
  });

  it('keys concepts by pitch class in the learner spelling', () => {
    expect(d2ConceptOf(item('find:A#@s6'), { ...ctx, accidentalPref: 'flat' })).toBe('Bb');
    expect(d2ConceptOf(item('note@s6f5'), ctx)).toBeNull();
  });
});

describe('D2 checking', () => {
  it('accepts any target cell', () => {
    const p = prompt('find:E@s6');
    expect(d2Check(p, at(6, 0))).toEqual({ correct: true, expected: 'E' });
    expect(d2Check(p, at(6, 12)).correct).toBe(true);
  });

  it('records the note tapped instead as the confusion', () => {
    const p = prompt('find:F@s6');
    expect(d2Check(p, at(6, 0))).toEqual({ correct: false, expected: 'F', confusedWith: 'E' });
  });

  it('treats the right note on the wrong string as a string error, not a confusion', () => {
    const p = prompt('find:G@s5', 1);
    expect(d2Check(p, at(6, 3))).toEqual({ correct: false, expected: 'G' });
  });

  it('marks dimmed cells inert and never correct', () => {
    const p = prompt('find:G@s5');
    expect(d2IsLive(p, at(5, 4))).toBe(true);
    expect(d2IsLive(p, at(4, 4))).toBe(false);
    expect(d2IsLive(p, at(5, 13))).toBe(false);
    expect(d2Check(p, at(6, 3))).toEqual({ correct: false, expected: 'G' });
    // G on string 5 at fret 22 is out of range, and so not a target.
    expect(d2Check(p, at(5, 15)).correct).toBe(false);
  });

  it('describes the tapped cell for the review log', () => {
    expect(d2DescribeAnswer(at(5, 10))).toBe('s5f10');
  });
});

describe('D2 feedback', () => {
  it('plays the tapped note when right', () => {
    const p = prompt('find:G@s5');
    expect(d2Sounds(p, feedback(p, at(5, 10)))).toEqual({ expected: ['G3'] });
  });

  it('plays the nearest right note and the tapped note when wrong', () => {
    const p = prompt('find:E@s6');
    expect(d2Sounds(p, feedback(p, at(6, 9)))).toEqual({ expected: ['E3'], given: ['C#3'] });
    expect(d2Sounds(p, feedback(p, at(6, 2)))).toEqual({ expected: ['E2'], given: ['F#2'] });
  });

  it('has nothing to compare when the prompt has no target', () => {
    const empty: D2Prompt = { ...prompt('find:G@s5'), targets: [] };
    expect(d2NearestTarget(empty, 3)).toBeNull();
    expect(d2Sounds(empty, feedback(empty, at(5, 3)))).toEqual({ expected: [] });
  });

  it('shows both positions when wrong and only the right ones when right', () => {
    const p = prompt('find:E@s6');
    expect(d2FeedbackPositions(p, feedback(p, at(6, 3)))).toEqual({
      expected: [at(6, 0), at(6, 12)],
      given: [at(6, 3)],
    });
    expect(d2FeedbackPositions(p, feedback(p, at(6, 12))).given).toEqual([]);
  });

  it('explains where the note is, octave repeats included', () => {
    const e = prompt('find:E@s6');
    expect(d2Explain(e, feedback(e, at(6, 12)))).toBe('E is at frets 0 and 12 on string 6.');
    const g = prompt('find:G@s5');
    expect(d2Explain(g, feedback(g, at(5, 8)))).toBe(
      'You tapped F (string 5, fret 8). G is at fret 10 on string 5.',
    );
    const none: D2Prompt = { ...g, targets: [] };
    expect(d2Explain(none, feedback(none, at(5, 8)))).toMatch(/G is at fret – on/);
  });
});

describe('D2 neck guides never give the answer away', () => {
  it('shows every guide on guided reps and in feedback', () => {
    const p = prompt('find:E@s6');
    expect(d2NeckGuideLevel(p, 0, { guided: true, answered: false })).toBe(3);
    expect(d2NeckGuideLevel(p, 3, { guided: false, answered: true })).toBe(3);
  });

  it('hides the string names while asking for a note an open string is named', () => {
    for (const pc of ['E', 'A', 'D', 'G', 'B']) {
      const p = prompt(`find:${pc}@s6`);
      expect(d2NeckGuideLevel(p, 3, { guided: false, answered: false }), pc).toBe(1);
      expect(d2NeckGuideLevel(p, 2, { guided: false, answered: false }), pc).toBe(1);
    }
  });

  it('keeps the fading guide level otherwise', () => {
    const c = prompt('find:C@s5');
    expect(d2NeckGuideLevel(c, 3, { guided: false, answered: false })).toBe(3);
    expect(d2NeckGuideLevel(prompt('find:E@s6'), 0, { guided: false, answered: false })).toBe(0);
  });
});

describe('D2 compact window', () => {
  const bounds = { from: 0, to: 12 };

  it('opens at the nut, or on the target for a worked example', () => {
    const p = prompt('find:G@s5');
    expect(d2InitialWindow(p, false)).toEqual({ from: 0, to: 4 });
    expect(d2InitialWindow(p, true)).toEqual({ from: 8, to: 12 });
    expect(d2InitialWindow({ ...p, targets: [] }, true)).toEqual({ from: 0, to: 4 });
  });

  it('slides within bounds', () => {
    expect(d2SlideWindow({ from: 0, to: 4 }, 1, bounds)).toEqual({ from: 4, to: 8 });
    expect(d2SlideWindow({ from: 4, to: 8 }, 2, bounds)).toEqual({ from: 8, to: 12 });
    expect(d2SlideWindow({ from: 4, to: 8 }, -3, bounds)).toEqual({ from: 0, to: 4 });
  });

  it('slides just enough to bring a fret into view', () => {
    const win = { from: 4, to: 8 };
    expect(d2WindowContaining(win, 6, bounds)).toBe(win);
    expect(d2WindowContaining(win, 9, bounds)).toEqual({ from: 5, to: 9 });
    expect(d2WindowContaining(win, 2, bounds)).toEqual({ from: 2, to: 6 });
  });

  it('spans several frets for feedback, at least a window wide', () => {
    expect(d2SpanWindow([2, 10], bounds)).toEqual({ from: 2, to: 10 });
    expect(d2SpanWindow([6, 7], bounds)).toEqual({ from: 5, to: 9 });
    expect(d2SpanWindow([0], bounds)).toEqual({ from: 0, to: 4 });
    expect(d2SpanWindow([12], { from: 0, to: 2 })).toEqual({ from: 0, to: 2 });
  });
});

describe('D2 keyboard path', () => {
  const area = { strings: [1, 2, 3, 4, 5, 6], range: { from: 0, to: 12 } };

  it('moves across strings as drawn, string 1 at the top', () => {
    expect(d2MoveFocus(at(5, 3), 'ArrowUp', area, 'right')).toEqual(at(4, 3));
    expect(d2MoveFocus(at(5, 3), 'ArrowDown', area, 'right')).toEqual(at(6, 3));
    expect(d2MoveFocus(at(6, 3), 'ArrowDown', area, 'right')).toEqual(at(6, 3));
    expect(d2MoveFocus(at(1, 3), 'ArrowUp', area, 'right')).toEqual(at(1, 3));
  });

  it('moves along the string, mirrored for a left-handed neck', () => {
    expect(d2MoveFocus(at(5, 3), 'ArrowRight', area, 'right')).toEqual(at(5, 4));
    expect(d2MoveFocus(at(5, 3), 'ArrowLeft', area, 'right')).toEqual(at(5, 2));
    expect(d2MoveFocus(at(5, 3), 'ArrowRight', area, 'left')).toEqual(at(5, 2));
    expect(d2MoveFocus(at(5, 0), 'ArrowLeft', area, 'right')).toEqual(at(5, 0));
    expect(d2MoveFocus(at(5, 12), 'ArrowRight', area, 'right')).toEqual(at(5, 12));
  });

  it('jumps to the ends of the string and ignores other keys', () => {
    expect(d2MoveFocus(at(5, 3), 'Home', area, 'right')).toEqual(at(5, 0));
    expect(d2MoveFocus(at(5, 3), 'End', area, 'right')).toEqual(at(5, 12));
    expect(d2MoveFocus(at(5, 3), 'x', area, 'right')).toBeNull();
  });

  it('stays on the live strings', () => {
    const one = { strings: [5], range: area.range };
    expect(d2MoveFocus(at(5, 3), 'ArrowUp', one, 'right')).toEqual(at(5, 3));
    expect(d2MoveFocus(at(2, 3), 'ArrowRight', one, 'right')).toEqual(at(5, 4));
  });

  it('starts on the open named string, clipped to what is on screen', () => {
    const p = prompt('find:G@s5');
    expect(d2InitialFocus(p, { from: 0, to: 12 })).toEqual(at(5, 0));
    expect(d2InitialFocus(p, { from: 4, to: 8 })).toEqual(at(5, 4));
    expect(intersectRange({ from: 0, to: 15 }, { from: 3, to: 12 })).toEqual({ from: 3, to: 12 });
  });
});
