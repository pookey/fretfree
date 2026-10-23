import { describe, expect, it } from 'vitest';
import { EAR_METERS } from '../../engine/items/meter-ear';
import { parseTimeSignature } from '../../theory';
import type { D30Prompt } from './logic';
import {
  d30Count,
  d30Explain,
  d30Fact,
  d30Guide,
  d30Heard,
  d30Spoken,
  d30SubLabel,
  d30Task,
  d30WorkedExample,
} from './text';

const prompt = (over: Partial<D30Prompt> = {}): D30Prompt => ({
  itemId: 'meter-ear:6/8',
  meter: '6/8',
  signature: '6/8',
  choices: ['3/4', '6/8'],
  style: 'strum',
  eighthsPerMinute: 180,
  chord: 0,
  ...over,
});

const counted = (s: string) =>
  d30Count(parseTimeSignature(s))
    .map((c) => c.syllable)
    .join(' ');

describe('D30 words', () => {
  it('labels every button with its meter’s style, and speaks it as a time', () => {
    for (const m of EAR_METERS) expect(d30SubLabel(m).length).toBeGreaterThan(0);
    expect(d30SubLabel('3/4')).toBe('waltz');
    expect(d30Spoken('12/8')).toBe('12/8 time');
    expect(d30Task()).toBe('Which meter is it?');
  });

  it('states the meter heard, with its grouping', () => {
    expect(d30Fact(prompt())).toBe(
      '6/8 is compound duple: 2 dotted-quarter beats, each split in 3.',
    );
    const odd = prompt({ meter: '7/8', signature: '7/8 (3+2+2)' });
    expect(d30Heard(odd)).toBe('7/8 (3+2+2)');
    expect(d30Fact(odd)).toBe('7/8 (3+2+2) is an odd meter: 3 uneven beats, grouped 3+2+2.');
    expect(d30WorkedExample(prompt())).toMatch(/^This is 6\/8\. Two big beats/);
  });

  it('counts a bar eighth by eighth, stressing the beats', () => {
    expect(counted('3/4')).toBe('1 & 2 & 3 &');
    expect(counted('6/8')).toBe('1 la li 2 la li');
    expect(counted('7/8 (2+2+3)')).toBe('1 & 2 & 3 la li');
    expect(counted('5/4 (3+2)')).toBe('1 & 2 & 3 & 4 & 5 &');
    expect(d30Count(parseTimeSignature('6/8')).map((c) => c.accent)).toEqual([
      'bar',
      'off',
      'off',
      'beat',
      'off',
      'off',
    ]);
  });

  it('explains the confusable pairs by how the bar is split', () => {
    expect(d30Explain(prompt(), '6/8')).toBeNull();
    expect(d30Explain(prompt(), '3/4')).toMatch(/six eighths.*twos.*threes/);
    expect(d30Explain(prompt({ meter: '4/4', signature: '4/4' }), '12/8')).toMatch(
      /four beats.*two.*three/,
    );
    expect(d30Explain(prompt({ meter: '12/8', signature: '12/8' }), '4/4')).toMatch(/shuffle/);
  });

  it('explains other mix-ups by the beats in a bar', () => {
    expect(d30Explain(prompt({ meter: '4/4', signature: '4/4' }), '3/4')).toBe(
      '3/4 has 3 beats in a bar; this was 4/4, with 4 beats.',
    );
    expect(d30Explain(prompt({ meter: '7/8', signature: '7/8 (2+2+3)' }), '5/4')).toBe(
      '5/4 has 5 beats in a bar; this was 7/8, with 3 beats.',
    );
  });

  it('guides every button alike, fading with the level', () => {
    const p = prompt({ choices: [...EAR_METERS] });
    expect(d30Guide(p, 0)).toEqual([]);
    const one = d30Guide(p, 1);
    expect(one.map((r) => r.meter)).toEqual([...EAR_METERS]);
    expect(one.every((r) => r.cue === null)).toBe(true);
    expect(one.find((r) => r.meter === '6/8')!.count).toBe('1 la li 2 la li');
    expect(d30Guide(p, 2).every((r) => r.cue && r.cue.length > 0)).toBe(true);
  });
});
