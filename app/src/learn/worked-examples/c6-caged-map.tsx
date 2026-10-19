import {
  cagedShape,
  intervalFromSemitones,
  midiAt,
  type CagedQuality,
  type CagedShapeName,
  type Degree,
  type Position,
} from '../../theory';
import { shapeStep } from './shapes';
import type { ExampleStep, WorkedExample } from './types';

/** The research/03 C6 misconception, said wherever a learner falls for a grip. */
export const MAP_CALLOUT =
  'CAGED is a map, not five grips: every note of a shape is an interval from a root you can name.';

const DEGREE_WORD: Readonly<Record<Degree, string>> = {
  R: 'root',
  '3': '3rd',
  b3: '♭3',
  '5': '5th',
  b7: '♭7',
};

const QUALITY_WORD: Readonly<Record<CagedQuality, string>> = {
  major: '',
  minor: ' minor',
  dominant7: '7',
};

/**
 * One note of a CAGED shape, found from one of the shape's roots as an
 * interval shape (C6). The root is given and the rest of the shape is drawn
 * as context, so the step reads as "the shape is roots plus shapes you
 * know". Answer and trap come from `shapeStep`; the shape template must
 * agree with them, so the two can't drift.
 */
export function cagedStep(
  shape: CagedShapeName,
  root: string,
  from: number,
  degree: Degree,
  to: number,
  opts: { quality?: CagedQuality; minFret?: number } = {},
): ExampleStep {
  const quality = opts.quality ?? 'major';
  const placed = cagedShape(shape, root, { quality, minFret: opts.minFret });
  const start = placed.notes.find((n) => n.string === from);
  const target = placed.notes.find((n) => n.string === to);
  if (start?.degree !== 'R' || target?.degree !== degree) {
    throw new RangeError(`The ${shape} shape has no root on ${from} and ${degree} on ${to}`);
  }
  const given: Position = { string: start.string, fret: start.fret };
  const interval = intervalFromSemitones(midiAt(target) - midiAt(given));
  const step = shapeStep(given, interval, to);
  if (step.answer.fret !== target.fret) throw new Error(`${shape} shape template disagrees`);
  const chord = `${root}${QUALITY_WORD[quality]}`;
  return {
    ...step,
    prompt: `The ${shape} shape of ${chord}: find its ${degree === 'R' ? 'other root' : DEGREE_WORD[degree]} on string ${to}.`,
    shape: placed.notes.filter((n) => n !== target),
    ...(step.trap && { trap: { ...step.trap, message: `${step.trap.message} ${MAP_CALLOUT}` } }),
  };
}

/**
 * C6: CAGED as a map, not five grips to memorise (research/03). Each step
 * finds a note of a shape from a root, with an interval shape the learner
 * already knows. Every one crosses the G–B pair, where a grip recalled
 * without its intervals slips a fret.
 */
const example: WorkedExample = {
  id: 'c6-caged-map',
  for: ['C6'],
  title: 'CAGED is a map',
  idea: 'Don’t memorise five grips. Find a root you can name, and every other note of the shape is an interval shape from it, G–B shift included.',
  steps: [
    cagedStep('A', 'C', 3, '3', 2),
    cagedStep('E', 'G', 4, '5', 2),
    cagedStep('D', 'A', 4, 'R', 2),
  ],
};

export default example;
