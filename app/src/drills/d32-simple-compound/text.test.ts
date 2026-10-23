import { describe, expect, it } from 'vitest';
import { meterItemId, type MeterFact } from '../../engine/items/meter';
import { STANDARD_TUNING } from '../../theory';
import { d32MakePrompt, type D32Prompt } from './logic';
import {
  beatStrip,
  beatsPhrase,
  d32BeatsSubject,
  d32Explain,
  d32Fact,
  d32Guides,
  d32Task,
  spokenChoice,
  spokenMeter,
  stripLabel,
} from './text';

const prompt = (meter: string, fact: MeterFact): D32Prompt =>
  d32MakePrompt(
    { id: meterItemId(meter, fact), skillId: 'T2.compound-meters' },
    { tuning: STANDARD_TUNING, accidentalPref: 'sharp', scopeLevel: 1, rng: () => 0 },
  );

describe('D32 words', () => {
  it('say a meter’s beats', () => {
    expect(beatsPhrase('6/8')).toBe('2 dotted-quarter beats');
    expect(beatsPhrase('3/4')).toBe('3 quarter-note beats');
    expect(beatsPhrase('2/2')).toBe('2 half-note beats');
    expect(d32BeatsSubject(prompt('12/8', 'fromBeats'))).toBe('4 dotted-quarter beats a bar');
  });

  it('give accessible names', () => {
    expect(spokenMeter('6/8')).toBe('6 8 time');
    expect(spokenMeter('2/2')).toBe('2 2 time, cut time');
    expect(spokenChoice('feltBeats', '2')).toBe('2 beats');
    expect(spokenChoice('beatUnit', '4.')).toBe('dotted quarter');
    expect(spokenChoice('kind', 'simple')).toBe('Simple');
    expect(spokenChoice('kind', 'compound')).toBe('Compound');
    expect(spokenChoice('fromBeats', '9/8')).toBe('9 8 time');
  });

  it('ask each kind of card', () => {
    expect(d32Task(prompt('6/8', 'feltBeats'))).toMatch(/How many beats/);
    expect(d32Task(prompt('6/8', 'beatUnit'))).toMatch(/What note/);
    expect(d32Task(prompt('6/8', 'kind'))).toBe('Simple or compound?');
    expect(d32Task(prompt('6/8', 'fromBeats'))).toBe('Which time signature is it?');
  });

  it('state the fact and why', () => {
    expect(d32Fact(prompt('6/8', 'kind'))).toBe(
      '6/8 is compound time: its 6 eighths group in threes, so a bar has 2 dotted-quarter beats.',
    );
    expect(d32Fact(prompt('3/4', 'feltBeats'))).toMatch(
      /^3\/4 is simple time: .* 3 quarter-note beats\.$/,
    );
    expect(d32Fact(prompt('2/2', 'beatUnit'))).toMatch(/cut time .* 2 half-note beats.*4\/4/);
  });
});

describe('d32Explain', () => {
  it('says nothing for a right answer', () => {
    expect(d32Explain(prompt('6/8', 'feltBeats'), '2')).toBeNull();
  });

  it('meets 6/8’s classic mistakes', () => {
    expect(d32Explain(prompt('6/8', 'feltBeats'), '6')).toBe(
      '6 counts the eighths. In compound time they group in threes: 6 ÷ 3 = 2 beats.',
    );
    expect(d32Explain(prompt('6/8', 'feltBeats'), '3')).toMatch(/^3 beats is 3\/4/);
    expect(d32Explain(prompt('6/8', 'beatUnit'), '8')).toMatch(/three of them: a dotted quarter/);
    expect(d32Explain(prompt('6/8', 'beatUnit'), '4')).toMatch(/^A quarter-note beat is 3\/4/);
    expect(d32Explain(prompt('6/8', 'fromBeats'), '3/4')).toBe('3/4 has 3 quarter-note beats.');
    expect(d32Explain(prompt('6/8', 'kind'), 'simple')).toMatch(/^A top number of 6/);
    expect(d32Explain(prompt('3/4', 'kind'), 'compound')).toMatch(/split in two, not three/);
  });

  it('says nothing it can’t back up', () => {
    expect(d32Explain(prompt('9/8', 'feltBeats'), '2')).toBeNull();
    expect(d32Explain(prompt('4/4', 'beatUnit'), '8')).toBeNull();
    expect(d32Explain(prompt('6/8', 'fromBeats'), '5/8')).toBeNull();
  });
});

describe('beat strip', () => {
  it('groups a bar’s pulses into felt beats', () => {
    expect(beatStrip('6/8')).toEqual([
      [
        { label: '1', beatStart: true },
        { label: 'la', beatStart: false },
        { label: 'li', beatStart: false },
      ],
      [
        { label: '2', beatStart: true },
        { label: 'la', beatStart: false },
        { label: 'li', beatStart: false },
      ],
    ]);
    expect(beatStrip('3/4').map((b) => b.map((c) => c.label))).toEqual([['1'], ['2'], ['3']]);
    expect(beatStrip('2/2')).toHaveLength(2);
  });

  it('names it', () => {
    expect(stripLabel('6/8')).toBe('6/8: 2 beats, each 3 eighths');
    expect(stripLabel('3/4')).toBe('3/4: 3 beats');
  });
});

describe('d32Guides', () => {
  it('fade with the guide level', () => {
    expect(d32Guides(0)).toEqual({ rules: [], counting: false });
    expect(d32Guides(1).rules).toHaveLength(2);
    expect(d32Guides(1).counting).toBe(false);
    expect(d32Guides(2).counting).toBe(true);
  });
});
