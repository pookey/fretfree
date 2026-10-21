import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { useAppStore } from '../../app-store';
import { DEFAULT_SETTINGS, getSkill } from '../../engine';
import {
  boxChordShape,
  chordFromNumeral,
  chromaOf,
  getProgression,
  intervalBetween,
  isRotationOf,
  majorKey,
  noteAt,
  pentatonicBox,
  samePosition,
  shapeKey,
  soundingKey,
} from '../../theory';
import c3 from './c3-fourths-fifths';
import c7, { boxStep } from './c7-box-1';
import c8, { numeralStep } from './c8-numerals';
import c9, { rotationStep } from './c9-rotation';
import c10, { capoStep } from './c10-capo';
import { exampleFor } from './index';
import { WorkedExample } from './WorkedExample';

vi.mock('../../audio/audio', () => ({ playNotes: vi.fn(() => Promise.resolve()) }));

beforeEach(() => {
  useAppStore.setState({ settings: { ...DEFAULT_SETTINGS } });
});

const pc = (p: { string: number; fret: number }) => noteAt(p).pc;

describe('the C3, C7, C8, C9 and C10 examples', () => {
  it('reach the skills they teach, and only those', () => {
    const example = (id: string) => exampleFor(getSkill(id)!)?.id;
    expect(example('C3.fourths-fifths')).toBe('c3-fourths-fifths');
    expect(example('C3.thirds')).toBe('c3-gb-thirds');
    expect(example('C7.minor-boxes')).toBe('c7-box-1');
    expect(example('C8.numerals-major')).toBe('c8-numerals');
    expect(example('C9.pop')).toBe('c9-rotation');
    for (const id of ['C10.capo-g-c-d', 'C10.capo-a-e', 'C10.capo-minor']) {
      expect(example(id)).toBe('c10-capo');
    }
    // Other boxes, notations and progressions would be misled by these.
    expect(example('C7.major-boxes')).toBeUndefined();
    expect(example('C8.nashville')).toBeUndefined();
    expect(example('C9.ii-V-I')).toBeUndefined();
  });
});

describe('c3-fourths-fifths', () => {
  it('crosses the G–B pair with 4ths and 5ths, one fret above the lower-string shape', () => {
    const intervals = c3.steps.map((s) => intervalBetween(s.given[0]!, s.answer));
    expect(intervals).toEqual(['P4', 'P5', 'P4']);
    c3.steps.forEach((step, i) => {
      const root = step.given[0]!;
      expect([root.string, step.answer.string]).toEqual([3, 2]);
      // Lower strings: a 4th at the same fret, a 5th two frets up.
      expect(step.answer.fret - root.fret).toBe(intervals[i] === 'P4' ? 1 : 3);
      expect(step.trap?.at.fret).toBe(step.answer.fret - 1);
    });
    expect(c3.steps[1].trap?.message).toBe(
      "Fret 6 is the shape without the G–B shift. That's F: a tritone, not a perfect 5th.",
    );
  });
});

describe('c8-numerals', () => {
  it('finds IV and V in C as interval shapes from the tonic', () => {
    expect(c8.steps.map((s) => pc(s.given[0]!))).toEqual(['C', 'C', 'C']);
    expect(c8.steps.map((s) => pc(s.answer))).toEqual(['F', 'G', 'F']);
    const key = majorKey('C');
    expect(chordFromNumeral(key, 'IV').root).toBe('F');
    expect(chordFromNumeral(key, 'V').root).toBe('G');
  });

  it('traps IV for V and V for IV, but not on the worked stage', () => {
    expect(c8.steps[0].trap).toBeUndefined();
    expect(c8.steps[1].trap).toEqual({
      at: { string: 5, fret: 8 },
      name: 'F',
      message:
        "That's F, the root of IV. V is the chord on the 5th degree: G, one string up, two frets up.",
    });
    expect(pc(c8.steps[2].trap!.at)).toBe('G');
  });

  it('names the chord and the shape in its copy', () => {
    const step = numeralStep({ string: 6, fret: 3 }, 'V', 5);
    expect(step.prompt).toBe('In G major, find the root of the V chord on string 5.');
    expect(step.explain).toMatch(/V is the chord on the 5th degree, so in G major it's D/);
    expect(step.hint).toBe('V is a perfect 5th above the tonic: one string up, two frets up.');
  });

  it('refuses a shape across the G–B pair, where the copy would be wrong', () => {
    expect(() => numeralStep({ string: 3, fret: 5 }, 'IV', 2)).toThrow(RangeError);
  });
});

describe('c9-rotation', () => {
  const pop = getProgression('I-V-vi-IV').numerals;
  const rotated = getProgression('vi-IV-I-V').numerals;

  it('finds the vi chord’s root: third in I–V–vi–IV, first in its rotation', () => {
    expect(isRotationOf(pop, rotated)).toBe(true);
    expect(c9.steps.map((s) => pc(s.answer))).toEqual(['A', 'E', 'B']);
    for (const step of c9.steps) {
      const key = majorKey(pc(step.given[0]!));
      expect(pc(step.answer)).toBe(chordFromNumeral(key, 'vi').root);
      expect(intervalBetween(step.answer, step.given[0]!)).toBe('m3');
    }
    expect(c9.steps[0].prompt).toBe(
      'I–V–vi–IV in C: find the root of its third chord on string 6.',
    );
    expect(c9.steps[1].prompt).toBe(
      'vi–IV–I–V in G: find the root of its first chord on string 5.',
    );
  });

  it('traps the tonic on the rotation, for the learner who takes the first chord for I', () => {
    expect(c9.steps[0].trap).toBeUndefined();
    for (const step of c9.steps.slice(1)) {
      const trap = step.trap!;
      expect(trap.at.string).toBe(step.answer.string);
      expect(trap.name).toBe(pc(step.given[0]!));
      expect(pc(trap.at)).toBe(trap.name);
      expect(trap.message).toMatch(/starts on vi, not I/);
    }
  });

  it('refuses a vi below the nut', () => {
    expect(() => rotationStep({ string: 6, fret: 1 }, 'vi-IV-I-V', 6)).toThrow(RangeError);
  });
});

describe('c10-capo', () => {
  it('counts up from the shape to the key that sounds, and traps counting down', () => {
    expect(c10.steps.map((s) => pc(s.given[0]!))).toEqual(['G', 'D', 'A']);
    for (const step of c10.steps) {
      const root = step.given[0]!;
      const capo = step.answer.fret - root.fret;
      const shape = majorKey(pc(root));
      expect(chromaOf(pc(step.answer))).toBe(chromaOf(soundingKey(shape, capo).tonic));
      expect(step.trap?.name).toBe(shapeKey(shape, capo).tonic);
      expect(step.trap?.at).toEqual({ string: root.string, fret: root.fret - capo });
      // Answers and traps are natural, so the neck's labels match the copy.
      expect(pc(step.answer)).toMatch(/^[A-G]$/);
      expect(pc(step.trap!.at)).toBe(step.trap!.name);
    }
    expect(c10.steps[2].prompt).toBe(
      'Capo on fret 2, playing an A shape: find the root it sounds, on string 3.',
    );
  });

  it('has no trap when counting down would pass the nut', () => {
    const step = capoStep({ string: 6, fret: 0 }, 2);
    expect(pc(step.answer)).toBe('F#');
    expect(step.trap).toBeUndefined();
    expect(step.explain).toMatch(/E shapes with a capo on fret 2 sound in F#/);
  });
});

describe('c7-box-1', () => {
  it('adds the 4th and ♭7 to the minor E shape, inside box 1', () => {
    const keys = ['A', 'A', 'G'];
    c7.steps.forEach((step, i) => {
      const box = pentatonicBox(keys[i]!, 'minor', 1);
      const chord = boxChordShape(box);
      expect(chord.shape).toBe('E');
      expect(step.shape).toEqual(chord.notes);
      expect(box.notes.some((n) => samePosition(n, step.answer))).toBe(true);
      expect(chord.notes.some((n) => samePosition(n, step.answer))).toBe(false);
      expect(chord.notes).toContainEqual({ ...step.given[0]!, degree: 'R' });
    });
    expect(c7.steps.map((s) => intervalBetween(s.given[0]!, s.answer))).toEqual(['P4', 'm7', 'm7']);
  });

  it('says when the unshifted G–B shape lands outside the scale', () => {
    expect(c7.steps[2].trap).toEqual({
      at: { string: 2, fret: 5 },
      name: 'E',
      message:
        "Fret 5 is the shape without the G–B shift. That's E: a major 6th, not a minor 7th. E isn't in G minor pentatonic.",
    });
  });

  it('refuses notes outside the box and roots the shape lacks', () => {
    expect(() => boxStep('A', 6, 'm7', 5)).toThrow(RangeError);
    expect(() => boxStep('A', 5, 'P4', 4)).toThrow(RangeError);
  });
});

describe('<WorkedExample> with the new examples', () => {
  const neck = () => screen.getByRole('group', { name: 'Worked example neck' });
  const tap = (string: number, fret: number) =>
    fireEvent.pointerDown(
      within(neck()).getByRole('button', { name: `string ${string}, fret ${fret}` }),
    );
  const next = () => fireEvent.click(screen.getByRole('button', { name: 'Next' }));

  it('calls out the rotation misconception when the learner taps the tonic', () => {
    render(<WorkedExample example={c9} />);
    tap(6, 5);
    next();
    expect(screen.getByTestId('example-hint')).toHaveTextContent('vi–IV–I–V starts on vi.');
    tap(5, 10);
    expect(screen.getByTestId('example-wrong')).toHaveTextContent('That’s G.');
    expect(screen.getByTestId('example-trap')).toHaveTextContent('In G it starts on Em.');
    expect(screen.getByTestId('marker-correct')).toHaveAttribute('data-fret', '7');
  });

  it('counts the capo up to the end', () => {
    render(<WorkedExample example={c10} />);
    expect(screen.getByTestId('marker-ghost')).toHaveAttribute('data-fret', '1');
    tap(6, 5);
    next();
    tap(2, 6);
    expect(screen.getByTestId('example-correct')).toHaveTextContent('sound in F');
    next();
    tap(3, 0);
    expect(screen.getByTestId('example-trap')).toHaveTextContent('count up from A');
    expect(screen.getByTestId('example-done')).toBeInTheDocument();
  });

  it('draws the E shape around box 1 and shows its degrees once answered', () => {
    render(<WorkedExample example={c7} />);
    tap(5, 5);
    expect(screen.getByTestId('example-correct')).toBeInTheDocument();
    expect(within(neck()).getAllByText('♭3').length).toBeGreaterThan(0);
  });
});
