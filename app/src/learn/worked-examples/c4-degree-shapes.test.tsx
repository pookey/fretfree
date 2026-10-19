import { describe, expect, it } from 'vitest';
import { SKILLS } from '../../engine';
import { intervalBetween, noteAt, scaleDegreeNote } from '../../theory';
import example, { degreeStep } from './c4-degree-shapes';
import { exampleFor } from './index';

describe('c4-degree-shapes', () => {
  it('is the example for every C4 skill', () => {
    const c4 = SKILLS.filter((s) => s.topic === 'C4');
    expect(c4.length).toBeGreaterThan(0);
    for (const skill of c4) expect(exampleFor(skill)?.id, skill.id).toBe('c4-degree-shapes');
  });

  it('lands every step on the degree of its key, spelt by the key', () => {
    const degrees = [6, 3, 7];
    const intervals = ['M6', 'M3', 'M7'];
    example.steps.forEach((step, i) => {
      const tonic = noteAt(step.given[0]!).pc;
      expect(noteAt(step.answer).pc).toBe(scaleDegreeNote(tonic, degrees[i]!));
      expect(intervalBetween(step.given[0]!, step.answer)).toBe(intervals[i]);
    });
  });

  it('asks for the degree, and says which note it is', () => {
    const step = degreeStep({ string: 6, fret: 3 }, 6, 4);
    expect(step.prompt).toBe('Find the 6th of G major on string 4.');
    expect(step.answer).toEqual({ string: 4, fret: 2 });
    expect(step.explain).toMatch(/E is the 6th of G major: the major 6th above G\.$/);
    expect(step.trap).toBeUndefined();
  });

  it('adds the key’s spelling to the G–B trap', () => {
    const step = example.steps[2];
    expect(step.trap).toEqual({
      at: { string: 2, fret: 8 },
      name: 'G',
      message:
        "Fret 8 is the shape without the G–B shift. That's G: a minor 7th, not a major 7th. In A major the 7th is G#.",
    });
  });

  it('refuses a degree the shape would misspell', () => {
    // F# major's 7th is E#; the neck would call it F.
    expect(() => degreeStep({ string: 6, fret: 2 }, 7, 4)).toThrow(/E#/);
    expect(() => degreeStep({ string: 6, fret: 3 }, 8, 4)).toThrow();
  });
});
