import { describe, expect, it } from 'vitest';
import { getSkill } from '../../engine/skills';
import { STANDARD_TUNING, type Position, type Tuning } from '../../theory';
import type { DrillFeedback } from '../types';
import {
  D33_ID,
  D33_SCOPE,
  d33CanTest,
  d33Check,
  d33CompactFrets,
  d33ConceptOf,
  d33DescribeAnswer,
  d33Explain,
  d33FeedbackPositions,
  d33InitialWindow,
  d33IsLive,
  d33LineMarks,
  d33LinePlace,
  d33MakePrompt,
  d33NeckGuideLevel,
  d33NoteStyle,
  d33Ordinal,
  d33ScopeFor,
  d33Sounds,
  d33StaffGuideLevel,
  d33StaffLabel,
  d33UpsideDown,
  type D33Prompt,
} from './logic';

const ctx = (scopeLevel = 0) => ({
  tuning: STANDARD_TUNING,
  accidentalPref: 'sharp' as const,
  scopeLevel,
  rng: () => 0,
});
const prompt = (id: string, scopeLevel = 0) =>
  d33MakePrompt({ id, skillId: 'TAB.string3' }, ctx(scopeLevel));
const fb = (p: D33Prompt, answer: Position): DrillFeedback<Position> => ({
  answer,
  result: d33Check(p, answer),
});

describe('D33 meta', () => {
  it('tests tab items only, keyed by their line', () => {
    expect(D33_ID).toBe('tab-to-neck');
    expect(D33_SCOPE).toEqual({ minLevel: 0, maxLevel: 1 });
    expect(d33CanTest({ id: 'tab@s3f5', skillId: 'TAB.string3' })).toBe(true);
    expect(d33CanTest({ id: 'note@s3f5', skillId: 'C2.all-notes' })).toBe(false);
    expect(d33ConceptOf({ id: 'tab@s6f0', skillId: 'TAB.string6' })).toBe('tab:line6');
    expect(d33ConceptOf({ id: 'find:G@s3', skillId: 'C2.all-notes' })).toBeNull();
  });

  it('can test every TAB item', () => {
    for (const s of [1, 2, 3, 4, 5, 6]) {
      for (const item of getSkill(`TAB.string${s}`)!.items()) {
        expect(d33CanTest(item), item.id).toBe(true);
        expect(d33MakePrompt(item, ctx()).target.string).toBe(s);
      }
    }
  });
});

describe('d33MakePrompt', () => {
  it('asks for the one cell the tab names, with every string live', () => {
    const p = prompt('tab@s3f5');
    expect(p).toMatchObject({
      itemId: 'tab@s3f5',
      target: { string: 3, fret: 5 },
      scope: 'region',
      activeRange: { from: 0, to: 12 },
    });
    for (const string of [1, 2, 3, 4, 5, 6]) expect(d33IsLive(p, { string, fret: 0 })).toBe(true);
    expect(d33IsLive(p, { string: 3, fret: 13 })).toBe(false);
    expect(d33IsLive(p, { string: 7, fret: 3 })).toBe(false);
  });

  it('widens to the whole neck at scope 1', () => {
    expect(d33ScopeFor(-1)).toBe('region');
    expect(d33ScopeFor(9)).toBe('neck');
    const p = prompt('tab@s3f5', 1);
    expect(p.activeRange).toEqual({ from: 0, to: 15 });
    expect(d33IsLive(p, { string: 3, fret: 15 })).toBe(true);
  });

  it('rejects items it cannot test, and strings the tuning lacks', () => {
    expect(() => prompt('note@s3f5')).toThrow(/cannot test/);
    const bass: Tuning = { id: 'bass', name: 'Bass', notes: ['E1', 'A1', 'D2', 'G2'] };
    expect(() =>
      d33MakePrompt({ id: 'tab@s6f0', skillId: 'TAB.string6' }, { ...ctx(), tuning: bass }),
    ).toThrow(/cannot test/);
  });
});

describe('d33Check', () => {
  const p = prompt('tab@s3f5');

  it('takes only the exact cell, keyed by its line', () => {
    expect(d33Check(p, { string: 3, fret: 5 })).toEqual({
      correct: true,
      expected: 'string 3, fret 5',
      concept: 'tab:line3',
    });
  });

  it('logs a misread line as a line confusion, even for the same pitch elsewhere', () => {
    expect(d33Check(p, { string: 2, fret: 5 })).toEqual({
      correct: false,
      expected: 'string 3, fret 5',
      concept: 'tab:line3',
      confusedWith: 'tab:line2',
    });
    // Open B is the same pitch as string 3, fret 4, but tab names a place.
    expect(d33Check(prompt('tab@s3f4'), { string: 2, fret: 0 })).toMatchObject({
      correct: false,
      confusedWith: 'tab:line2',
    });
  });

  it('treats a wrong fret on the right string, or a dead cell, as no confusion', () => {
    expect(d33Check(p, { string: 3, fret: 7 })).toEqual({
      correct: false,
      expected: 'string 3, fret 5',
      concept: 'tab:line3',
    });
    expect(d33Check(p, { string: 2, fret: 14 }).confusedWith).toBeUndefined();
  });

  it('describes the answer as a cell', () => {
    expect(d33DescribeAnswer({ string: 6, fret: 12 })).toBe('s6f12');
  });
});

describe('upside-down reading', () => {
  it('spots the mirror line for the outer pairs, not the middle neighbours', () => {
    expect(d33UpsideDown(prompt('tab@s1f3'), { string: 6, fret: 3 })).toBe(true);
    expect(d33UpsideDown(prompt('tab@s5f3'), { string: 2, fret: 3 })).toBe(true);
    expect(d33UpsideDown(prompt('tab@s3f3'), { string: 4, fret: 3 })).toBe(false);
    expect(d33UpsideDown(prompt('tab@s1f3'), { string: 2, fret: 3 })).toBe(false);
  });
});

describe('feedback', () => {
  const p = prompt('tab@s3f5');

  it('sounds the note, and the tapped one when wrong', () => {
    expect(d33Sounds(p, fb(p, { string: 3, fret: 5 }))).toEqual({ expected: ['C4'] });
    expect(d33Sounds(p, fb(p, { string: 2, fret: 5 }))).toEqual({
      expected: ['C4'],
      given: ['E4'],
    });
  });

  it('marks the right cell, and the tapped one when wrong', () => {
    expect(d33FeedbackPositions(p, fb(p, { string: 3, fret: 5 }))).toEqual({
      expected: [{ string: 3, fret: 5 }],
      given: [],
    });
    expect(d33FeedbackPositions(p, fb(p, { string: 4, fret: 5 })).given).toEqual([
      { string: 4, fret: 5 },
    ]);
  });

  it('explains which string the line is, and what was wrong', () => {
    const where = 'The 3rd line from the top is string 3 (G): fret 5 there is C.';
    expect(d33Explain(p, fb(p, { string: 3, fret: 5 }))).toBe(where);
    expect(d33Explain(p, fb(p, { string: 3, fret: 7 }))).toBe(
      `You tapped string 3, fret 7. Right string; the number says fret 5. ${where}`,
    );
    expect(d33Explain(p, fb(p, { string: 2, fret: 5 }))).toBe(
      `You tapped string 2, fret 5. Right fret, wrong line. ${where}`,
    );
    expect(d33Explain(p, fb(p, { string: 5, fret: 2 }))).toBe(
      `You tapped string 5, fret 2. ${where}`,
    );
  });

  it('names the upside-down misreading', () => {
    const top = prompt('tab@s1f3');
    expect(d33Explain(top, fb(top, { string: 6, fret: 3 }))).toBe(
      'You tapped string 6, fret 3. That reads the tab upside down: the top line is the high e string. ' +
        'The top line is string 1 (e): fret 3 there is G.',
    );
    const bottom = prompt('tab@s6f0');
    expect(d33Explain(bottom, fb(bottom, { string: 6, fret: 0 }))).toBe(
      'The bottom line is string 6 (E): fret 0 there is E.',
    );
  });

  it('says lines by place from the top', () => {
    expect(d33Ordinal(1)).toBe('1st');
    expect(d33Ordinal(2)).toBe('2nd');
    expect(d33Ordinal(3)).toBe('3rd');
    expect(d33Ordinal(4)).toBe('4th');
    expect(d33Ordinal(11)).toBe('11th');
    expect(d33Ordinal(22)).toBe('22nd');
    expect(d33LinePlace(1, STANDARD_TUNING)).toBe('the top line');
    expect(d33LinePlace(5, STANDARD_TUNING)).toBe('the 5th line from the top');
    expect(d33LinePlace(6, STANDARD_TUNING)).toBe('the bottom line');
  });
});

describe('guides', () => {
  it('shows every line name on the worked example and in feedback, else fades', () => {
    expect(d33StaffGuideLevel(0, { guided: true, answered: false })).toBe(3);
    expect(d33StaffGuideLevel(1, { guided: false, answered: true })).toBe(3);
    expect(d33StaffGuideLevel(1, { guided: false, answered: false })).toBe(1);
  });

  it('fades the neck as usual, with full guides on the worked example', () => {
    expect(d33NeckGuideLevel(1, { guided: true })).toBe(3);
    expect(d33NeckGuideLevel(2, { guided: false })).toBe(2);
  });

  it('styles the note and the lines for the worked example and feedback', () => {
    const p = prompt('tab@s3f5');
    expect(d33NoteStyle(null)).toBe('current');
    expect(d33NoteStyle(fb(p, { string: 3, fret: 5 }))).toBe('correct');
    expect(d33NoteStyle(fb(p, { string: 3, fret: 6 }))).toBe('current');
    expect(d33LineMarks(p, { guided: false, feedback: null })).toEqual([]);
    expect(d33LineMarks(p, { guided: true, feedback: null })).toEqual([
      { string: 3, style: 'selected' },
    ]);
    expect(d33LineMarks(p, { guided: false, feedback: fb(p, { string: 3, fret: 6 }) })).toEqual([
      { string: 3, style: 'correct' },
    ]);
    expect(d33LineMarks(p, { guided: true, feedback: fb(p, { string: 4, fret: 5 }) })).toEqual([
      { string: 3, style: 'correct' },
      { string: 4, style: 'wrong' },
    ]);
  });
});

describe('d33StaffLabel', () => {
  const p = prompt('tab@s3f5');

  it('names the string only where the staff shows it', () => {
    expect(d33StaffLabel(p, 3)).toBe(
      'Tab, 6 lines: one note on the 3rd line from the top, string 3 (G), at fret 5',
    );
    expect(d33StaffLabel(p, 2)).toBe(
      'Tab, 6 lines: one note on the 3rd line from the top, the G line, at fret 5',
    );
    expect(d33StaffLabel(p, 1)).toBe(
      'Tab, 6 lines: one note on the 3rd line from the top, at fret 5. The top line is e, the bottom line E',
    );
    expect(d33StaffLabel(p, 0)).toBe(
      'Tab, 6 lines: one note on the 3rd line from the top, at fret 5',
    );
    for (const level of [0, 1, 2] as const) expect(d33StaffLabel(p, level)).not.toMatch(/string/);
  });
});

describe('d33InitialWindow', () => {
  it('opens at the nut, or on the target for the worked example', () => {
    const p = prompt('tab@s3f9');
    expect(d33InitialWindow(p, false, 5)).toEqual({ from: 0, to: 4 });
    const guided = d33InitialWindow(p, true, 5);
    expect(guided.from).toBeLessThanOrEqual(9);
    expect(guided.to).toBeGreaterThanOrEqual(9);
  });
});

describe('d33CompactFrets', () => {
  it('keeps the session’s window in portrait and on iPad', () => {
    expect(d33CompactFrets(5, 390, 844)).toBe(5);
    expect(d33CompactFrets(undefined, 734, 343)).toBeUndefined();
  });

  it('narrows a landscape phone’s window to the room beside the staff', () => {
    const frets = d33CompactFrets(9, 734, 343)!;
    expect(frets).toBeLessThan(9);
    expect(frets).toBeGreaterThanOrEqual(5);
    expect(d33CompactFrets(6, 2000, 343)).toBe(6);
  });
});
