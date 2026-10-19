import { chordToneOf, type CagedShapeName } from '../../theory';
import { MAP_CALLOUT, cagedStep } from './c6-caged-map';
import type { ExampleStep, WorkedExample } from './types';

/**
 * The ♭3 of a minor CAGED shape, found from one of its roots. A step that
 * doesn't cross the G–B pair gets the major shape's 3rd as its trap, a fret
 * up: major and minor shapes are the classic confusion (research/02 rule 6).
 */
export function minorThirdStep(
  shape: CagedShapeName,
  root: string,
  from: number,
  to: number,
): ExampleStep {
  const step = cagedStep(shape, root, from, 'b3', to, { quality: 'minor' });
  if (step.trap) return step;
  const major = chordToneOf(root, 'major', '3') ?? '';
  const minor = chordToneOf(root, 'minor', 'b3') ?? '';
  return {
    ...step,
    trap: {
      at: { string: to, fret: step.answer.fret + 1 },
      name: major,
      message: `That's ${major}: the major 3rd, from the ${shape} shape of ${root} major. ${root} minor flattens it a fret, to ${minor}. ${MAP_CALLOUT}`,
    },
  };
}

/**
 * C6 minor shapes and cores: the same map, with the 3rd a fret lower. Each
 * step finds the ♭3 from a root, so the one note that makes the shape minor
 * is the one the learner reads.
 */
const example: WorkedExample = {
  id: 'c6-minor-map',
  for: ['C6.minor-cores', 'C6.minor-shapes'],
  title: 'Minor shapes on the map',
  idea: 'A minor CAGED shape is the major shape with its 3rd a fret lower. Find a root, then the ♭3: three half steps above it.',
  steps: [
    minorThirdStep('A', 'D', 3, 2),
    minorThirdStep('E', 'A', 4, 3),
    minorThirdStep('D', 'E', 2, 1),
  ],
};

export default example;
