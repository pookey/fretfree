import { describe, expect, it } from 'vitest';
import { intervalBetween, noteAt } from '../../theory';
import { describeShape, landmarkStep, shapeStep } from './shapes';

describe('describeShape', () => {
  it('says how far across and along the neck a shape goes', () => {
    expect(describeShape(6, 4, 2)).toBe('two strings up, two frets up');
    expect(describeShape(4, 3, -1)).toBe('one string up, one fret back');
    expect(describeShape(3, 2, 0)).toBe('one string up, same fret');
    expect(describeShape(2, 2, 12)).toBe('same string, 12 frets up');
    expect(describeShape(1, 3, -3)).toBe('two strings down, three frets back');
  });
});

describe('shapeStep', () => {
  it('builds an octave shape that does not cross the G–B pair, with no trap', () => {
    const step = shapeStep({ string: 6, fret: 3 }, 'P8', 4);
    expect(step).toEqual({
      prompt: 'Find the octave of G on string 4.',
      given: [{ string: 6, fret: 3 }],
      answer: { string: 4, fret: 5 },
      explain: 'G on string 6, fret 3 → G on string 4, fret 5: two strings up, two frets up.',
      hint: 'Two strings up, two frets up.',
    });
  });

  it('adds a fret across the G–B pair and targets the unshifted shape', () => {
    const step = shapeStep({ string: 4, fret: 5 }, 'P8', 2);
    expect(step.answer).toEqual({ string: 2, fret: 8 });
    expect(step.hint).toBe('Two strings up, three frets up.');
    expect(step.explain).toMatch(/major 3rd above G, not a 4th/);
    expect(step.trap).toEqual({
      at: { string: 2, fret: 7 },
      message:
        "Fret 7 is the shape without the G–B shift. That's F#: a major 7th, not a perfect octave.",
    });
  });

  it('names the interval it builds, and its trap', () => {
    const step = shapeStep({ string: 3, fret: 5 }, 'M3', 2);
    expect(step.prompt).toBe('Find the major 3rd above C on string 2.');
    expect(step.answer).toEqual({ string: 2, fret: 5 });
    expect(step.trap?.message).toBe(
      "Fret 4 is the shape without the G–B shift. That's D#: a minor 3rd, not a major 3rd.",
    );
  });

  it('moves the trap the other way coming down across the pair', () => {
    // Root on the B string, a 4th below on the G string: the unshifted shape is a fret high.
    const step = shapeStep({ string: 2, fret: 5 }, 'P4', 3);
    expect(noteAt(step.answer).pc).toBe('A');
    expect(step.trap?.at).toEqual({ string: 3, fret: step.answer.fret + 1 });
  });

  it('always sounds the asked interval', () => {
    for (const [root, to] of [
      [{ string: 6, fret: 3 }, 4],
      [{ string: 4, fret: 7 }, 2],
      [{ string: 3, fret: 2 }, 1],
    ] as const) {
      expect(intervalBetween(root, shapeStep(root, 'P8', to).answer)).toBe('P8');
    }
  });
});

describe('landmarkStep', () => {
  it('finds a natural at its lowest fret and names the landmark', () => {
    expect(landmarkStep('A', 6, 'the second marker')).toEqual({
      prompt: 'Find A on string 6.',
      given: [],
      answer: { string: 6, fret: 5 },
      explain: 'A is at fret 5: the second marker.',
      hint: 'The second marker.',
    });
    expect(landmarkStep('E', 6, 'the double dot').answer).toEqual({ string: 6, fret: 12 });
  });

  it('rejects a note that is not on the string', () => {
    expect(() => landmarkStep('H', 6, 'x')).toThrow();
  });
});
