import { shapeStep } from './shapes';
import type { WorkedExample } from './types';

/**
 * Octaves across the G–B pair: from strings 4 and 3 the shape is three frets
 * up, not two (research/03 C1). Finding notes by octave is how strings 2 and
 * 1 join the notes learnt on strings 6 and 5, so it leads into C2.
 */
const example: WorkedExample = {
  id: 'c2-gb-octaves',
  for: ['C2.all-notes'],
  title: 'Octaves across the G–B shift',
  idea: 'Crossing from the G string to the B string, octave shapes move up one fret.',
  steps: [
    shapeStep({ string: 4, fret: 5 }, 'P8', 2),
    shapeStep({ string: 3, fret: 2 }, 'P8', 1),
    shapeStep({ string: 4, fret: 7 }, 'P8', 2),
  ],
};

export default example;
