import { shapeStep } from './shapes';
import type { WorkedExample } from './types';

/** C1: the octave shape two strings up, on strings that don't cross the G–B pair. */
const example: WorkedExample = {
  id: 'c1-octave-shapes',
  for: ['C1.octaves'],
  title: 'The octave shape',
  idea: 'From strings 6 and 5, the same note sits two strings up and two frets up.',
  steps: [
    shapeStep({ string: 6, fret: 3 }, 'P8', 4),
    shapeStep({ string: 5, fret: 5 }, 'P8', 3),
    shapeStep({ string: 6, fret: 8 }, 'P8', 4),
  ],
};

export default example;
