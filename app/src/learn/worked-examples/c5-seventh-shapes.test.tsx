import { describe, expect, it } from 'vitest';
import { getSkill } from '../../engine';
import { intervalBetween } from '../../theory';
import example, { seventhStep } from './c5-seventh-shapes';
import { exampleFor } from './index';

describe('c5-seventh-shapes', () => {
  it('is the example for the 7th-chord skills', () => {
    expect(exampleFor(getSkill('C5.tones-sevenths')!)?.id).toBe('c5-seventh-shapes');
    expect(exampleFor(getSkill('C5.sevenths')!)?.id).toBe('c5-seventh-shapes');
  });

  it('pairs the ♭7 of a 7 chord with the major 7th of maj7, a fret apart', () => {
    for (const step of example.steps) {
      const asked = intervalBetween(step.given[0]!, step.answer);
      const other = intervalBetween(step.given[0]!, step.trap!.at);
      expect([asked, other].sort()).toEqual(['M7', 'm7']);
      expect(step.trap!.at.string).toBe(step.answer.string);
      expect(Math.abs(step.trap!.at.fret - step.answer.fret)).toBe(1);
    }
    // Both directions of the confusion (research/02 rule 6).
    expect(example.steps.map((s) => intervalBetween(s.given[0]!, s.answer))).toEqual([
      'm7',
      'm7',
      'M7',
    ]);
  });

  it('names the chord, its 7th and the confusion', () => {
    const step = seventhStep({ string: 6, fret: 5 }, '7', 4);
    expect(step.prompt).toBe('Find the 7th of A7 on string 4.');
    expect(step.answer).toEqual({ string: 4, fret: 5 });
    expect(step.explain).toMatch(/A7 takes the flat 7th: G, a whole step below A\.$/);
    expect(step.trap).toEqual({
      at: { string: 4, fret: 6 },
      name: 'G#',
      message: "That's G#: the major 7th, the 7 in Amaj7. A7 takes the flat 7th, G.",
    });
    const maj7 = seventhStep({ string: 5, fret: 3 }, 'maj7', 3);
    expect(maj7.trap?.name).toBe('Bb');
    expect(maj7.trap?.message).toBe(
      "That's Bb: the flat 7th, the 7 in C7. Cmaj7 takes the major 7th, B.",
    );
  });

  it('refuses a shape across the G–B pair, whose trap is the shift', () => {
    expect(() => seventhStep({ string: 4, fret: 5 }, '7', 2)).toThrow(/G–B/);
  });
});
