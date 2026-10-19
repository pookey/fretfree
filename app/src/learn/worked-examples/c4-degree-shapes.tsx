import { Interval } from 'tonal';
import {
  MAJOR_DEGREE_INTERVALS,
  degreeOrdinal,
  intervalFromSemitones,
  intervalInfo,
  noteAt,
  scaleDegreeNote,
  type Position,
} from '../../theory';
import { shapeStep } from './shapes';
import type { ExampleStep, WorkedExample } from './types';

/**
 * The `degree` of the major key on `tonic`, found on `toString` as an
 * interval shape from the tonic. The note is named from the key's spelling
 * (each letter once), and must be the note the shape lands on, so the copy
 * can't drift from the maths.
 */
export function degreeStep(tonic: Position, degree: number, toString: number): ExampleStep {
  const key = noteAt(tonic).pc;
  const note = scaleDegreeNote(key, degree);
  const interval = intervalFromSemitones(
    Interval.semitones(MAJOR_DEGREE_INTERVALS[degree - 1] ?? ''),
  );
  const step = shapeStep(tonic, interval, toString);
  if (noteAt(step.answer).pc !== note) {
    throw new RangeError(
      `${key} major's ${degree} is ${note}; the example would spell it otherwise`,
    );
  }
  const ordinal = degreeOrdinal(degree);
  const { trap } = step;
  return {
    ...step,
    prompt: `Find the ${ordinal} of ${key} major on string ${toString}.`,
    explain: `${step.explain} ${note} is the ${ordinal} of ${key} major: the ${intervalInfo(interval).long} above ${key}.`,
    ...(trap && {
      trap: { ...trap, message: `${trap.message} In ${key} major the ${ordinal} is ${note}.` },
    }),
  };
}

/**
 * C4: a degree of a key is a fixed interval above its tonic (research/03:
 * "the 6th of E♭?"), so on the neck it's an interval shape from the root,
 * G–B shift included. Sharp keys only: the shapes name notes with sharps.
 */
const example: WorkedExample = {
  id: 'c4-degree-shapes',
  for: ['C4'],
  title: 'Scale degrees as shapes',
  idea: 'In a major key the 2nd, 3rd, 6th and 7th are major intervals above the tonic, and the 4th and 5th are perfect. So each degree is an interval shape from the root.',
  steps: [
    degreeStep({ string: 6, fret: 3 }, 6, 4),
    degreeStep({ string: 5, fret: 5 }, 3, 4),
    degreeStep({ string: 4, fret: 7 }, 7, 2),
  ],
};

export default example;
