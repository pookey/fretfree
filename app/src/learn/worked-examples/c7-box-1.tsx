import {
  boxChordShape,
  noteAt,
  pentatonicBox,
  pentatonicScale,
  samePitchClass,
  samePosition,
  type Position,
} from '../../theory';
import { shapeStep } from './shapes';
import type { ExampleStep, WorkedExample } from './types';

/** The two notes box 1 adds to the minor E shape, and the interval each is from the root. */
const ADDED = { P4: '4th', m7: '♭7' } as const;

export type BoxDegree = keyof typeof ADDED;

/**
 * A note of minor box 1 that its E shape lacks, found from a root of the
 * shape as an interval shape. The shape is drawn as context, so the box
 * reads as "the chord plus two notes" (research/03 C7: overlay a box on its
 * shape). The answer must be in the box and off the shape, so the copy
 * can't drift from `theory/`. A trap from the G–B shift says when its note
 * is outside the scale too.
 */
export function boxStep(
  root: string,
  fromString: number,
  interval: BoxDegree,
  toString: number,
): ExampleStep {
  const box = pentatonicBox(root, 'minor', 1);
  const chord = boxChordShape(box);
  const start = chord.notes.find((n) => n.string === fromString && n.degree === 'R');
  if (!start) throw new RangeError(`The E shape of ${root}m has no root on string ${fromString}`);
  const given: Position = { string: start.string, fret: start.fret };
  const step = shapeStep(given, interval, toString);
  const inBox = box.notes.some((n) => samePosition(n, step.answer));
  if (!inBox || chord.notes.some((n) => samePosition(n, step.answer))) {
    throw new RangeError(
      `${root} minor box 1 doesn't add a note at ${toString}:${step.answer.fret}`,
    );
  }
  const pc = noteAt(step.answer).pc;
  const degree = ADDED[interval];
  const boxed: ExampleStep = {
    ...step,
    prompt: `Box 1 of ${root} minor wraps the E shape of ${root}m. Find the box’s ${degree} on string ${toString}.`,
    explain: `${step.explain} ${pc} is the ${degree} of ${root} minor pentatonic: box 1 is the E shape of ${root}m plus its 4th and ♭7.`,
    shape: chord.notes,
  };
  const { trap } = boxed;
  if (!trap) return boxed;
  const outside = !pentatonicScale(root, 'minor').some((n) => samePitchClass(n, trap.name));
  return outside
    ? {
        ...boxed,
        trap: {
          ...trap,
          message: `${trap.message} ${trap.name} isn't in ${root} minor pentatonic.`,
        },
      }
    : boxed;
}

/**
 * C7: minor box 1 is the E-shape minor chord with two notes added, the 4th
 * and the ♭7. Each step finds one from a root of the shape, in A minor and
 * then G minor (rule 12); the last crosses the G–B pair, where the unshifted
 * shape lands on a note outside the scale.
 */
const example: WorkedExample = {
  id: 'c7-box-1',
  for: ['C7.minor-boxes'],
  title: 'Box 1 around the E shape',
  idea: 'Minor pentatonic box 1 is the E-shape minor chord, root, ♭3 and 5, plus the two notes it lacks: the 4th and the ♭7. Learn the box as the shape and its two extra notes.',
  steps: [boxStep('A', 6, 'P4', 5), boxStep('A', 6, 'm7', 4), boxStep('G', 4, 'm7', 2)],
};

export default example;
