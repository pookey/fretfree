import { shapeStep } from './shapes';
import type { WorkedExample } from './types';

/**
 * C3: the major 3rd across the G–B pair is straight up the neck, one fret
 * higher than its shape on the lower strings (research/03: the +1 fret shift).
 */
const example: WorkedExample = {
  id: 'c3-gb-thirds',
  for: ['C3'],
  title: 'Major 3rds across the G–B shift',
  idea: 'On the lower strings a major 3rd is one string up, one fret back. From G to B it is straight up.',
  steps: [
    shapeStep({ string: 3, fret: 5 }, 'M3', 2),
    shapeStep({ string: 3, fret: 10 }, 'M3', 2),
    shapeStep({ string: 3, fret: 12 }, 'M3', 2),
  ],
};

export default example;
