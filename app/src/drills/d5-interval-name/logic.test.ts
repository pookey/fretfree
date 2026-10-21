import { describe, expect, it } from 'vitest';
import { SKILLS } from '../../engine/skills';
import { SHAPE_INTERVALS, STANDARD_TUNING, getTuning, intervalBetween, midiAt } from '../../theory';
import type { DrillContext } from '../types';
import {
  D5_CHOICE_COUNTS,
  D5_FRETS,
  D5_SCOPE,
  d5CanTest,
  d5Check,
  d5Choices,
  d5ConceptOf,
  d5ChoiceLabel,
  d5DescribeAnswer,
  d5Explain,
  d5FeedbackPositions,
  d5GivenPosition,
  d5KeyFor,
  d5KeyToAnswer,
  d5LegendRows,
  d5LegendTips,
  d5LineLegend,
  d5MakePrompt,
  d5Sounds,
  d5SpellUpper,
  d5WorkedExample,
  type D5Answer,
  type D5Prompt,
} from './logic';

const ctx = (over: Partial<DrillContext> = {}): DrillContext => ({
  tuning: STANDARD_TUNING,
  accidentalPref: 'sharp',
  scopeLevel: 0,
  rng: () => 0,
  ...over,
});

const item = (id: string) => ({ id, skillId: 'C3.thirds' });
const prompt = (id: string, over: Partial<DrillContext> = {}) => d5MakePrompt(item(id), ctx(over));
const fb = (p: D5Prompt, answer: D5Answer) => ({ answer, result: d5Check(p, answer) });

/** Every `interval-name:` item the C3 skills list. */
const C3_ITEMS = SKILLS.filter((s) => s.topic === 'C3')
  .flatMap((s) => s.items())
  .filter(d5CanTest);

describe('D5 items', () => {
  it('tests only interval-name items', () => {
    expect(d5CanTest(item('interval-name:M3@s6→s5'))).toBe(true);
    expect(d5CanTest(item('interval:M3@s6→s5'))).toBe(false);
    expect(d5CanTest(item('note@s6f5'))).toBe(false);
    expect(() => prompt('interval:M3@s6→s5')).toThrow(/cannot test/);
  });

  it('keys the confusion matrix by interval name', () => {
    expect(d5ConceptOf(item('interval-name:P5@s5→s4'))).toBe('P5');
    expect(d5ConceptOf(item('octave:s6f5→s4'))).toBeNull();
  });

  it('covers every C3 skill', () => {
    expect(C3_ITEMS.length).toBeGreaterThan(0);
  });
});

describe('d5MakePrompt', () => {
  it('draws the root and upper note of the shape', () => {
    const p = prompt('interval-name:M3@s6→s5');
    // M3 from string 6 to 5 is one fret back: the lowest root fret is 2.
    expect(p.root).toEqual({ string: 6, fret: 2 });
    expect(p.upper).toEqual({ string: 5, fret: 1 });
    expect(p).toMatchObject({
      interval: 'M3',
      semitones: 4,
      rootPc: 'F#',
      rootName: 'F#2',
      upperName: 'A#2',
      gbShift: false,
      pref: 'sharp',
    });
  });

  it('spells notes with the accidental preference', () => {
    const p = prompt('interval-name:M3@s6→s5', { accidentalPref: 'flat' });
    expect(p.rootPc).toBe('Gb');
    expect(p.upperName).toBe('Bb2');
  });

  it('flags shapes that cross the G–B pair', () => {
    const p = prompt('interval-name:M3@s3→s2');
    expect(p.gbShift).toBe(true);
    expect(p.upper.fret - p.root.fret).toBe(0);
  });

  it('varies the root fret with the rng (rule 12)', () => {
    const frets = new Set(
      [0, 0.25, 0.5, 0.75, 0.999, 1].map(
        (r) => prompt('interval-name:P4@s5→s4', { rng: () => r }).root.fret,
      ),
    );
    expect(frets.size).toBeGreaterThan(3);
    expect(Math.max(...frets)).toBe(D5_FRETS.to);
  });

  it('places every C3 item on frets 1–12 with the right interval, in any rng', () => {
    for (const it of C3_ITEMS) {
      for (const r of [0, 0.37, 0.999]) {
        const p = d5MakePrompt(it, ctx({ rng: () => r }));
        for (const pos of [p.root, p.upper]) {
          expect(pos.fret, it.id).toBeGreaterThanOrEqual(D5_FRETS.from);
          expect(pos.fret, it.id).toBeLessThanOrEqual(D5_FRETS.to);
        }
        expect(intervalBetween(p.root, p.upper), it.id).toBe(p.interval);
        expect(midiAt(p.upper, STANDARD_TUNING) - midiAt(p.root, STANDARD_TUNING)).toBe(
          p.semitones,
        );
        expect(p.choices).toContain(p.interval);
      }
    }
  });

  it('follows the tuning', () => {
    const dropD = getTuning('drop-d');
    const p = d5MakePrompt(item('interval-name:P5@s6→s5'), ctx({ tuning: dropD }));
    expect(intervalBetween(p.root, p.upper, dropD)).toBe('P5');
  });

  it('refuses a shape that cannot fit on frets 1–12', () => {
    expect(() => prompt('interval-name:M7@s1→s6')).toThrow(/cannot fit/);
  });
});

describe('d5Choices', () => {
  it('scales the button count with the scope level', () => {
    for (let level = D5_SCOPE.minLevel; level <= D5_SCOPE.maxLevel; level++) {
      expect(d5Choices('P5', level, () => 0.5)).toHaveLength(D5_CHOICE_COUNTS[level] as number);
    }
    expect(d5Choices('P5', D5_SCOPE.maxLevel, () => 0)).toEqual(SHAPE_INTERVALS);
    // Out-of-range levels clamp.
    expect(d5Choices('P5', -1, () => 0)).toHaveLength(4);
    expect(d5Choices('P5', 9, () => 0)).toHaveLength(12);
  });

  it('keeps the nearest neighbours as distractors, in ascending order', () => {
    expect(d5Choices('M3', 0, () => 0)).toEqual(['m2', 'M2', 'm3', 'M3']);
    expect(d5Choices('M3', 0, () => 0.999)).toEqual(['M3', 'P4', 'TT', 'P5']);
    expect(d5Choices('m2', 0, () => 0.5)).toEqual(['m2', 'M2', 'm3', 'M3']);
    expect(d5Choices('P8', 0, () => 0.5)).toEqual(['M6', 'm7', 'M7', 'P8']);
    expect(d5Choices('TT', 1, () => 0)).toEqual(['m2', 'M2', 'm3', 'M3', 'P4', 'TT', 'P5']);
  });

  it('moves the answer across button positions as the rng varies', () => {
    const slots = new Set(
      [0, 0.3, 0.6, 0.999].map((r) => d5Choices('P4', 0, () => r).indexOf('P4')),
    );
    expect(slots).toEqual(new Set([0, 1, 2, 3]));
  });
});

describe('d5Check and answers', () => {
  const p = prompt('interval-name:M3@s6→s5');

  it('grades by interval name and records the confusion', () => {
    expect(d5Check(p, 'M3')).toEqual({ correct: true, expected: 'M3' });
    expect(d5Check(p, 'm3')).toEqual({ correct: false, expected: 'M3', confusedWith: 'm3' });
    expect(d5DescribeAnswer('m3')).toBe('m3');
  });

  it('writes the worked example', () => {
    expect(d5WorkedExample(p)).toBe('This is a major 3rd (M3), 4 half steps up from F♯.');
  });

  it('plays both notes, plus the root and the chosen note when wrong', () => {
    expect(d5Sounds(p, fb(p, 'M3'))).toEqual({ expected: ['F#2', 'A#2'] });
    expect(d5Sounds(p, fb(p, 'P4'))).toEqual({ expected: ['F#2', 'A#2'], given: ['F#2', 'B2'] });
    // An answer that is not an interval name only plays the right one.
    expect(d5Sounds(p, fb(p, 'X' as D5Answer))).toEqual({ expected: ['F#2', 'A#2'] });
  });

  it('marks the upper note, and where a wrong answer would be', () => {
    expect(d5FeedbackPositions(p, fb(p, 'M3'), STANDARD_TUNING)).toEqual({
      expected: [{ string: 5, fret: 1 }],
      given: [],
    });
    expect(d5FeedbackPositions(p, fb(p, 'P4'), STANDARD_TUNING)).toEqual({
      expected: [{ string: 5, fret: 1 }],
      given: [{ string: 5, fret: 2 }],
    });
    // m2 above F#2 is G2: below string 5's open A, so off the neck.
    expect(d5GivenPosition(p, 'm2', STANDARD_TUNING)).toBeNull();
    expect(d5FeedbackPositions(p, fb(p, 'm2'), STANDARD_TUNING).given).toEqual([]);
    expect(d5GivenPosition(p, 'X' as D5Answer, STANDARD_TUNING)).toBeNull();
  });
});

describe('d5Explain', () => {
  // M3 from string 5 to 4 with its root at fret 3: C up to E.
  const c = prompt('interval-name:M3@s5→s4', { rng: () => 0.1 });

  it('the C-to-E example is what it says', () => {
    expect(c.root).toEqual({ string: 5, fret: 3 });
    expect([c.rootPc, c.upperPc]).toEqual(['C', 'E']);
  });

  it('says what the chosen name means, then counts the shape', () => {
    expect(d5Explain(c, fb(c, 'm3'))).toBe(
      'You chose m3 (a minor 3rd, 3 half steps). From C up to E is 4 half steps: a major 3rd, M3.',
    );
    // A wider miss: the count is the same method.
    expect(d5Explain(c, fb(c, 'P5'))).toBe(
      'You chose P5 (a perfect 5th, 7 half steps). From C up to E is 4 half steps: a major 3rd, M3.',
    );
  });

  it('confirms a right answer in one short line', () => {
    expect(d5Explain(c, fb(c, 'M3'))).toBe('Major 3rd: 4 half steps up from C.');
    const tt = prompt('interval-name:TT@s5→s4');
    expect(d5Explain(tt, fb(tt, 'TT'))).toMatch(/^Tritone: 6 half steps up from /);
  });

  it('names the G–B shift when a shape across it is read a half step too big', () => {
    const gb = prompt('interval-name:M3@s3→s2');
    expect(gb.gbShift).toBe(true);
    const line = d5Explain(gb, fb(gb, 'P4'));
    expect(line).toMatch(/^You chose P4 \(a perfect 4th, 5 half steps\)\. From \S+ up to \S+ is 4/);
    expect(line).toMatch(
      /G and B are a major 3rd apart, so this shape is a half step smaller here\.$/,
    );
    // Too small is a different slip: no G–B note.
    expect(d5Explain(gb, fb(gb, 'm3'))).not.toContain('G and B');
    // Off the G–B pair, a P4 for an M3 is a plain miscount.
    expect(d5Explain(c, fb(c, 'P4'))).not.toContain('G and B');
  });

  it('spells sharps and flats as ♯ and ♭', () => {
    const p = prompt('interval-name:M3@s6→s5');
    expect(d5Explain(p, fb(p, 'M3'))).toBe('Major 3rd: 4 half steps up from F♯.');
    expect(d5Explain(p, fb(p, 'm3'))).toContain('From F♯ up to A♯ is 4 half steps');
    const flat = prompt('interval-name:M3@s6→s5', { accidentalPref: 'flat' });
    expect(d5Explain(flat, fb(flat, 'm3'))).toContain('From G♭ up to B♭');
  });

  it('spells the upper note from the root, not by the sharp/flat preference', () => {
    // m3 from string 5 to 4, root at fret 3: C up to E♭ (not D♯) with sharps.
    const m3 = prompt('interval-name:m3@s5→s4');
    expect(m3.root).toEqual({ string: 5, fret: 3 });
    expect(d5Explain(m3, fb(m3, 'm2'))).toBe(
      'You chose m2 (a minor 2nd, 1 half step). From C up to E♭ is 3 half steps: a minor 3rd, m3.',
    );
    // M3 from the open-E octave (fret 12) with flats: E up to G♯ (not A♭).
    const e = prompt('interval-name:M3@s6→s5', { accidentalPref: 'flat', rng: () => 0.999 });
    expect(e.root).toEqual({ string: 6, fret: 12 });
    expect(d5Explain(e, fb(e, 'm3'))).toContain('From E up to G♯ is 4 half steps');
  });

  it('names only the root when spelling from it needs a double sharp', () => {
    // M3 above A♯ is C𝄪: the line counts from the root instead.
    const a = prompt('interval-name:M3@s6→s5', { rng: () => 0.37 });
    expect([a.rootPc, a.upperPc]).toEqual(['A#', null]);
    expect(d5Explain(a, fb(a, 'm3'))).toBe(
      'You chose m3 (a minor 3rd, 3 half steps). It is 4 half steps up from A♯: a major 3rd, M3.',
    );
  });

  it('only counts the shape for an answer that is not an interval', () => {
    expect(d5Explain(c, fb(c, 'X' as D5Answer))).toBe(
      'From C up to E is 4 half steps: a major 3rd, M3.',
    );
  });

  it('labels a button with its short name, then the name in words', () => {
    expect(d5ChoiceLabel('M3')).toBe('M3, major 3rd');
    expect(d5ChoiceLabel('TT')).toBe('TT, tritone');
  });
});

describe('d5SpellUpper', () => {
  it('spells flat intervals from a natural root under the sharp preference', () => {
    expect(d5SpellUpper('C', 'm3', 'sharp')).toBe('Eb');
    expect(d5SpellUpper('C', 'm7', 'sharp')).toBe('Bb');
    expect(d5SpellUpper('C', 'm6', 'sharp')).toBe('Ab');
    expect(d5SpellUpper('G', 'm3', 'sharp')).toBe('Bb');
  });

  it('spells sharp intervals from a natural root under the flat preference', () => {
    expect(d5SpellUpper('E', 'M3', 'flat')).toBe('G#');
    expect(d5SpellUpper('B', 'M3', 'flat')).toBe('D#');
  });

  it('keeps a sharp root’s spelling, and gives up on a double accidental', () => {
    expect(d5SpellUpper('G#', 'M3', 'sharp')).toBe('B#');
    expect(d5SpellUpper('F#', 'M7', 'sharp')).toBe('E#');
    expect(d5SpellUpper('A#', 'M3', 'sharp')).toBeNull();
    expect(d5SpellUpper('Gb', 'm3', 'flat')).toBeNull();
  });

  it('spells the tritone as ♯4 or ♭5 by preference', () => {
    expect(d5SpellUpper('C', 'TT', 'sharp')).toBe('F#');
    expect(d5SpellUpper('C', 'TT', 'flat')).toBe('Gb');
    expect(d5SpellUpper('C', 'P8', 'sharp')).toBe('C');
  });
});

describe('keyboard', () => {
  const choices = d5Choices('P5', 2, () => 0);

  it('maps the number row to buttons by position', () => {
    expect(d5KeyToAnswer('1', choices)).toBe('m2');
    expect(d5KeyToAnswer('9', choices)).toBe('M6');
    expect(d5KeyToAnswer('0', choices)).toBe('m7');
    expect(d5KeyToAnswer('-', choices)).toBe('M7');
    expect(d5KeyToAnswer('=', choices)).toBe('P8');
    expect(d5KeyToAnswer('x', choices)).toBeNull();
    expect(d5KeyToAnswer('5', ['m3', 'M3'])).toBeNull();
    expect(d5KeyFor(0)).toBe('1');
    expect(d5KeyFor(11)).toBe('=');
    expect(d5KeyFor(12)).toBeUndefined();
  });
});

describe('interval legend', () => {
  const choices = d5Choices('M3', 0, () => 0);

  it('fades with the guide level', () => {
    expect(d5LegendRows(choices, 0)).toEqual([]);
    expect(d5LegendRows(choices, 1)[3]).toEqual({ name: 'M3', long: 'major 3rd' });
    expect(d5LegendRows(choices, 2)[3]).toEqual({ name: 'M3', long: 'major 3rd', semitones: 4 });
    expect(d5LegendRows(choices, 3)).toHaveLength(4);
    expect(d5LegendTips(2, true, 4)).toEqual([]);
    expect(d5LegendTips(3, false, 4)).toEqual([
      'Count half steps up from the square (the lower note) to the round dot.',
    ]);
    expect(d5LegendTips(3, true, 4)).toHaveLength(2);
    expect(d5LegendTips(3, true, 4)[1]).toMatch(/G to B, which are a major 3rd apart/);
  });

  it('packs past four choices into one-line rows without the count tip', () => {
    expect(d5LineLegend(4)).toBe(false);
    expect(d5LineLegend(5)).toBe(true);
    expect(d5LegendTips(3, false, 12)).toEqual([]);
    // The G–B tip stays: the counts on the rows don't explain the shifted fret.
    expect(d5LegendTips(3, true, 12)).toEqual([expect.stringMatching(/G to B/)]);
    expect(d5LegendTips(2, true, 12)).toEqual([]);
  });
});
