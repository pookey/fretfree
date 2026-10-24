import { describe, expect, it } from 'vitest';
import { meterItemId } from '../../engine/items/meter';
import { frac } from '../../theory';
import { FULL_PALETTE, type D29Prompt } from './logic';
import {
  d29Explain,
  d29Fact,
  d29Guides,
  d29Task,
  d29WorkedExample,
  hiddenLine,
  placedLabel,
  roomLabel,
  spokenMeter,
} from './text';

const prompt = (meter: string, given = '', solution = '4'): D29Prompt => ({
  itemId: meterItemId(meter, 'feltBeats'),
  meter,
  given,
  palette: [...FULL_PALETTE],
  solution,
});

const answer = (text: string) => ({ placed: text.split(' ').filter(Boolean) });

describe('D29 words', () => {
  it('asks to complete a started bar, or fill an empty one', () => {
    expect(d29Task(prompt('3/4', '4'))).toBe('Complete the bar.');
    expect(d29Task(prompt('3/4'))).toBe('Fill the bar.');
  });

  it('names the fill in the worked example', () => {
    expect(d29WorkedExample(prompt('6/8', '8 8 8', '4 8'))).toBe(
      'A bar of 6/8 has 2 dotted-quarter beats. Place a quarter and an eighth to finish it.',
    );
  });

  it('names the meter in feedback', () => {
    expect(d29Fact('6/8')).toBe('Compound duple: 2 dotted-quarter beats, each split in 3.');
    expect(d29Fact('3/4')).toBe('Simple triple: 3 quarter beats, each split in 2.');
  });

  it('says a time signature aloud', () => {
    expect(spokenMeter('6/8')).toBe('6 8 time');
    expect(spokenMeter('2/2')).toBe('2 2 time, cut time');
  });
});

describe('d29Explain', () => {
  it('says nothing for a right bar', () => {
    expect(d29Explain(prompt('6/8', '4.'), answer('8 8 8'))).toEqual([]);
  });

  it('explains a 6/8 bar filled as 3/4: groups in dotted quarters', () => {
    expect(d29Explain(prompt('6/8'), answer('4 4 4'))).toEqual([
      '6/8 groups in dotted quarters: the quarter from the 3rd eighth runs into beat 2, hiding it. Fill one dotted-quarter beat at a time.',
      'Those notes make a bar of 3/4: 3 quarter-note beats.',
    ]);
  });

  it('explains a 3/4 bar filled as 6/8', () => {
    expect(d29Explain(prompt('3/4'), answer('4. 4.'))).toEqual([
      '3/4 groups in quarters: the dotted quarter from “&” of beat 2 runs across beat 3, hiding it. A note that starts between beats should end by the next one.',
      'Those notes make a bar of 6/8: 2 dotted-quarter beats.',
    ]);
  });

  it('says how much a bar is short or over', () => {
    expect(d29Explain(prompt('6/8', '4.'), answer('4'))).toEqual([
      'Short by an eighth: a bar of 6/8 holds 6 eighths.',
    ]);
    expect(d29Explain(prompt('3/4', '2'), answer('2'))).toEqual([
      'Over by a quarter: a bar of 3/4 holds 3 quarters.',
    ]);
  });

  it('explains a half that ends inside beat 2 of 6/8', () => {
    expect(d29Explain(prompt('6/8'), answer('2 4'))).toEqual([
      '6/8 groups in dotted quarters: the half from beat 1 runs into beat 2, hiding it. Fill one dotted-quarter beat at a time.',
      'Those notes make a bar of 3/4: 3 quarter-note beats.',
    ]);
  });

  it('asks 4/4 to show the middle of the bar', () => {
    expect(d29Explain(prompt('4/4'), answer('4 8 4 8 4'))).toEqual([
      'Show the middle of the bar: the quarter from “&” of beat 2 runs across beat 3, the middle of 4/4. Start it on a beat, or use shorter notes.',
      'Those notes make a bar of 2/2: 2 half-note beats.',
    ]);
  });

  it('names a compound note by its eighth, or its count between eighths', () => {
    expect(
      hiddenLine('12/8', {
        placed: 0,
        code: '4',
        beat: 3,
        count: 'li',
        eighth: 9,
        hides: 4,
        middle: false,
      }),
    ).toMatch(/^12\/8 groups in dotted quarters: the quarter from the 9th eighth runs into beat 4/);
    expect(d29Explain(prompt('6/8'), answer('8. 4 16 4'))[0]).toMatch(
      /the quarter from “ta” of beat 1 runs into beat 2/,
    );
  });
});

describe('labels', () => {
  it('says what room is left', () => {
    expect(roomLabel(frac(3, 8))).toBe('Room for a dotted quarter');
    expect(roomLabel(frac(0))).toBe('Full');
    expect(roomLabel(frac(-1, 8))).toBe('Over by an eighth');
  });

  it('names a placed value and its place', () => {
    expect(placedLabel('4.', 1, 3)).toBe('Dotted quarter, value 2 of 3');
  });
});

describe('d29Guides', () => {
  it('fades the rules, the scale and the beats (rule 9)', () => {
    expect(d29Guides(0)).toEqual({ rules: [], scale: false, beatLines: false });
    const one = d29Guides(1);
    expect(one.scale).toBe(true);
    expect(one.beatLines).toBe(false);
    expect(one.rules.length).toBeGreaterThan(0);
    expect(d29Guides(2).beatLines).toBe(true);
    expect(d29Guides(3).beatLines).toBe(true);
  });
});
