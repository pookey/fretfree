import { describe, expect, it } from 'vitest';
import { getSkill } from '../../engine/skills';
import { STANDARD_TUNING } from '../../theory';
import type { DrillFeedback } from '../types';
import {
  D39_MARKERS,
  d39CanTest,
  d39Check,
  d39ChoiceLabel,
  d39ConceptOf,
  d39DescribeAnswer,
  d39Explain,
  d39FeedbackPositions,
  d39FeedbackRange,
  d39FretLook,
  d39FretName,
  d39MakePrompt,
  d39MoveFocus,
  d39NeckGuideLevel,
  d39Ordinal,
  d39Question,
  d39Sounds,
  d39SpotlightLabel,
  d39TypeKey,
  d39WorkedExample,
  type D39Answer,
  type D39Prompt,
} from './logic';

const item = (id: string) => ({ id, skillId: 'F3.markers' });
const prompt = (id: string, scopeLevel = 0) =>
  d39MakePrompt(item(id), {
    tuning: STANDARD_TUNING,
    accidentalPref: 'sharp',
    scopeLevel,
    rng: () => 0,
  });
const fb = (p: D39Prompt, answer: D39Answer): DrillFeedback<D39Answer> => ({
  answer,
  result: d39Check(p, answer),
});

describe('D39 item coverage', () => {
  it('tests every F3 item and nothing else', () => {
    for (const id of ['F3.markers', 'F3.repeat-12']) {
      for (const i of getSkill(id)!.items()) expect(d39CanTest(i), i.id).toBe(true);
    }
    expect(d39CanTest(item('marker:f4'))).toBe(false);
    expect(d39CanTest(item('marker:f15'))).toBe(false);
    expect(d39CanTest(item('repeat:+5@f3'))).toBe(false);
    expect(d39CanTest(item('repeat:+12@f15'))).toBe(false);
    expect(d39CanTest(item('repeat:-12@f3'))).toBe(false);
    expect(d39CanTest(item('note@s6f5'))).toBe(false);
    expect(() => prompt('note@s6f5')).toThrow(/cannot test/);
  });

  it('keys concepts by the answer fret', () => {
    expect(d39ConceptOf(item('marker:f7'))).toBe('fret:7');
    expect(d39ConceptOf(item('find-marker:f12'))).toBe('fret:12');
    expect(d39ConceptOf(item('repeat:+12@f3'))).toBe('fret:15');
    expect(d39ConceptOf(item('repeat:-12@f12'))).toBe('fret:0');
    expect(d39ConceptOf(item('note@s6f5'))).toBeNull();
  });
});

describe('D39 prompts', () => {
  it('names a spotlit marker from the landmark frets, or every fret when widened', () => {
    const p = prompt('marker:f7');
    expect(p).toMatchObject({ mode: 'name-marker', from: 7, expected: 7 });
    expect(p.choices).toEqual([...D39_MARKERS]);
    expect(p.range).toEqual({ from: 0, to: 12 });
    expect(prompt('marker:f7', 1).choices).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(d39Question(p)).toBe('Which fret is this marker on?');
    expect(d39WorkedExample(p)).toBe('This is the 7th-fret marker.');
  });

  it('finds a marker on the neck, with no buttons', () => {
    const p = prompt('find-marker:f3');
    expect(p).toMatchObject({ mode: 'find-marker', expected: 3, choices: [] });
    expect(d39Question(p)).toBe('Tap the 3rd-fret marker');
    expect(d39WorkedExample(p)).toBe('The 3rd-fret marker is here.');
  });

  it('asks where a fret repeats from the other octave’s landmarks', () => {
    const up = prompt('repeat:+12@f3');
    expect(up).toMatchObject({ mode: 'repeat', from: 3, expected: 15 });
    expect(up.range).toEqual({ from: 0, to: 12 });
    expect(up.choices).toEqual([12, 15, 17, 19, 21, 24]);
    expect(d39Question(up)).toBe('Which fret has the same notes as fret 3, an octave higher?');
    expect(d39WorkedExample(up)).toMatch(/^Fret 15 has the same notes as fret 3, an octave higher/);

    const down = prompt('repeat:-12@f12');
    expect(down).toMatchObject({ from: 12, expected: 0 });
    expect(down.range).toEqual({ from: 12, to: 24 });
    // 12 sits in both octaves but is never its own answer.
    expect(down.choices).toEqual([0, 3, 5, 7, 9]);
    expect(d39Question(down)).toBe('Which fret has the same notes as fret 12, an octave lower?');
    expect(d39WorkedExample(down)).toMatch(/^The open strings have the same notes as fret 12/);

    const open = prompt('repeat:+12@f0');
    expect(open.choices).toEqual([12, 15, 17, 19, 21, 24]);
    expect(d39Question(open)).toBe(
      'Which fret has the same notes as the open strings, an octave higher?',
    );
    expect(prompt('repeat:+12@f12').choices).not.toContain(12);
  });

  it('widens a repeat to every fret of the other octave', () => {
    expect(prompt('repeat:-12@f15', 1).choices).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it('every prompt’s answer is one of its choices', () => {
    for (const id of ['F3.markers', 'F3.repeat-12']) {
      for (const i of getSkill(id)!.items()) {
        for (const level of [0, 1]) {
          const p = prompt(i.id, level);
          if (p.mode !== 'find-marker') expect(p.choices, i.id).toContain(p.expected);
        }
      }
    }
  });
});

describe('D39 grading and feedback', () => {
  it('grades the fret and logs the confusion as a fret', () => {
    const p = prompt('marker:f7');
    expect(d39Check(p, 7)).toEqual({ correct: true, expected: 'fret 7' });
    expect(d39Check(p, 9)).toEqual({ correct: false, expected: 'fret 7', confusedWith: 'fret:9' });
    expect(d39Check(prompt('repeat:-12@f12'), 0).expected).toBe('the open strings');
    expect(d39DescribeAnswer(9)).toBe('f9');
  });

  it('plays the marker on the low string, and both frets of a repeat', () => {
    const p = prompt('marker:f5');
    expect(d39Sounds(p, fb(p, 5))).toEqual({ expected: ['A2'] });
    expect(d39Sounds(p, fb(p, 7))).toEqual({ expected: ['A2'], given: ['B2'] });
    const r = prompt('repeat:+12@f3');
    expect(d39Sounds(r, fb(r, 15))).toEqual({ expected: ['G2', 'G3'] });
  });

  it('shows the answer fret on every string, and the wrong fret too', () => {
    const p = prompt('find-marker:f9');
    const right = d39FeedbackPositions(p, fb(p, 9), STANDARD_TUNING);
    expect(right.expected.map((x) => x.string)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(right.expected.every((x) => x.fret === 9)).toBe(true);
    expect(right.given).toEqual([]);
    expect(d39FeedbackPositions(p, fb(p, 7), STANDARD_TUNING).given).toHaveLength(6);
  });

  it('widens a repeat’s feedback to show both frets and the answer given', () => {
    const r = prompt('repeat:+12@f3');
    expect(d39FeedbackRange(r, 15)).toEqual({ from: 3, to: 15 });
    expect(d39FeedbackRange(r, 24)).toEqual({ from: 3, to: 24 });
    const m = prompt('marker:f3');
    expect(d39FeedbackRange(m, 5)).toEqual(m.range);
  });

  it('never draws fret numbers on an open marker prompt', () => {
    const m = prompt('marker:f12');
    expect(d39NeckGuideLevel(m, 3, { guided: false, answered: false })).toBe(1);
    expect(d39NeckGuideLevel(m, 0, { guided: false, answered: false })).toBe(0);
    expect(d39NeckGuideLevel(m, 2, { guided: false, answered: true })).toBe(2);
    expect(d39NeckGuideLevel(m, 0, { guided: true, answered: false })).toBe(3);
    expect(d39NeckGuideLevel(prompt('repeat:+12@f5'), 3, { guided: false, answered: false })).toBe(
      3,
    );
  });
});

describe('D39 explanations', () => {
  it('counts the dots from the nut when a marker is missed', () => {
    const p = prompt('marker:f7');
    expect(d39Explain(p, fb(p, 5))).toBe('Count the dots from the nut: 3, 5, 7.');
    expect(d39Explain(p, fb(p, 9))).toBe('Count the dots from the nut: 3, 5, 7.');
  });

  it('names the double dot at 12, and the first dot on its own', () => {
    const twelve = prompt('marker:f12');
    expect(d39Explain(twelve, fb(twelve, 9))).toBe(
      'Count the dots from the nut: 3, 5, 7, 9, then the double dot, 12.',
    );
    const three = prompt('marker:f3');
    expect(d39Explain(three, fb(three, 5))).toBe('The first dot from the nut is fret 3.');
  });

  it('says when the chosen fret has no dot (a near miss at the wider scope)', () => {
    const p = prompt('marker:f7', 1);
    expect(d39Explain(p, fb(p, 6))).toBe(
      'Fret 6 has no dot. Count the dots from the nut: 3, 5, 7.',
    );
  });

  it('counts the dots for a find prompt too, but says nothing of the open strings', () => {
    const p = prompt('find-marker:f5');
    expect(d39Explain(p, fb(p, 4))).toBe('Fret 4 has no dot. Count the dots from the nut: 3, 5.');
    expect(d39Explain(p, fb(p, 0))).toBe('Count the dots from the nut: 3, 5.');
  });

  it('confirms a right marker answer with the same count', () => {
    const p = prompt('marker:f9');
    expect(d39Explain(p, fb(p, 9))).toBe('Count the dots from the nut: 3, 5, 7, 9.');
  });

  it('restates the 12-fret repeat, and does the sum on a miss', () => {
    const up = prompt('repeat:+12@f3');
    const rule =
      'Fret 15 has the same notes as fret 3, an octave higher: the neck repeats every 12 frets.';
    expect(d39Explain(up, fb(up, 15))).toBe(rule);
    expect(d39Explain(up, fb(up, 17))).toBe(`${rule} 3 + 12 = 15.`);
    const down = prompt('repeat:-12@f17');
    expect(d39Explain(down, fb(down, 7))).toBe(
      'Fret 5 has the same notes as fret 17, an octave lower: the neck repeats every 12 frets. 17 − 12 = 5.',
    );
  });

  it('skips the sum when one end is the open strings', () => {
    const p = prompt('repeat:-12@f12');
    expect(d39Explain(p, fb(p, 5))).toBe(
      'The open strings have the same notes as fret 12, an octave lower: the neck repeats every 12 frets.',
    );
    const open = prompt('repeat:+12@f0');
    expect(d39Explain(open, fb(open, 24))).toBe(
      'Fret 12 has the same notes as the open strings, an octave higher: the neck repeats every 12 frets.',
    );
  });
});

describe('D39 labels', () => {
  it('names frets and ordinals', () => {
    expect(d39FretName(0)).toBe('the open strings');
    expect(d39FretName(12)).toBe('fret 12');
    expect(d39ChoiceLabel(0)).toBe('Open');
    expect(d39ChoiceLabel(7)).toBe('7');
    expect([1, 2, 3, 5, 11, 12, 13, 21, 22, 23].map(d39Ordinal)).toEqual([
      '1st',
      '2nd',
      '3rd',
      '5th',
      '11th',
      '12th',
      '13th',
      '21st',
      '22nd',
      '23rd',
    ]);
  });
});

describe('D39 typed answers', () => {
  const markers = [3, 5, 7, 9, 12];

  it('answers a digit at once when nothing else starts with it', () => {
    expect(d39TypeKey('', '7', markers)).toEqual({ typed: '', answer: 7 });
  });

  it('waits for the second digit, or Enter', () => {
    expect(d39TypeKey('', '1', markers)).toEqual({ typed: '1', answer: null });
    expect(d39TypeKey('1', '2', markers)).toEqual({ typed: '', answer: 12 });
    const all = Array.from({ length: 12 }, (_, i) => i + 1);
    expect(d39TypeKey('', '1', all)).toEqual({ typed: '1', answer: null });
    expect(d39TypeKey('1', 'Enter', all)).toEqual({ typed: '', answer: 1 });
    expect(d39TypeKey('', 'Enter', all)).toEqual({ typed: '', answer: null });
  });

  it('restarts on a digit that leads nowhere, and ignores dead keys', () => {
    expect(d39TypeKey('1', '7', markers)).toEqual({ typed: '', answer: 7 });
    expect(d39TypeKey('1', '4', markers)).toEqual({ typed: '', answer: null });
    expect(d39TypeKey('1', 'x', markers)).toEqual({ typed: '1', answer: null });
    expect(d39TypeKey('1', 'Enter', markers)).toEqual({ typed: '1', answer: null });
  });

  it('clears on Escape or Backspace, and answers the open string with o or 0', () => {
    expect(d39TypeKey('1', 'Escape', markers)).toEqual({ typed: '', answer: null });
    expect(d39TypeKey('1', 'Backspace', markers)).toEqual({ typed: '', answer: null });
    const low = [0, 3, 5, 7, 9];
    expect(d39TypeKey('', 'o', low)).toEqual({ typed: '', answer: 0 });
    expect(d39TypeKey('', 'O', markers)).toEqual({ typed: '', answer: null });
    expect(d39TypeKey('', '0', low)).toEqual({ typed: '', answer: 0 });
  });
});

describe('D39 accessibility', () => {
  it('describes a fret by how it looks, never by its number', () => {
    expect([0, 1, 3, 12].map(d39FretLook)).toEqual([
      'open strings',
      'no marker',
      'single-dot marker',
      'double-dot marker',
    ]);
    for (let f = 0; f <= 12; f++) expect(d39FretLook(f)).not.toMatch(/\d/);
  });

  it('names the spotlit marker by its place from the nut', () => {
    expect(d39SpotlightLabel(3)).toBe('Fretboard. The 1st marker from the nut is spotlit.');
    expect(d39SpotlightLabel(7)).toBe('Fretboard. The 3rd marker from the nut is spotlit.');
    expect(d39SpotlightLabel(12)).toBe(
      'Fretboard. The 5th marker from the nut is spotlit, the double dot.',
    );
  });

  it('moves the focus fret along the neck as drawn', () => {
    const range = { from: 0, to: 12 };
    expect(d39MoveFocus(3, 'ArrowRight', range, 'right')).toBe(4);
    expect(d39MoveFocus(3, 'ArrowLeft', range, 'right')).toBe(2);
    expect(d39MoveFocus(3, 'ArrowRight', range, 'left')).toBe(2);
    expect(d39MoveFocus(12, 'ArrowRight', range, 'right')).toBe(12);
    expect(d39MoveFocus(0, 'ArrowLeft', range, 'right')).toBe(0);
    expect(d39MoveFocus(5, 'Home', range, 'right')).toBe(0);
    expect(d39MoveFocus(5, 'End', range, 'right')).toBe(12);
    expect(d39MoveFocus(5, 'ArrowUp', range, 'right')).toBeNull();
  });
});
