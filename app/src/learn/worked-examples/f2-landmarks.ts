import { landmarkStep } from './shapes';
import type { WorkedExample } from './types';

/**
 * F2: recall naturals on string 6 from the inlay markers rather than counting
 * up from the nut (research/03).
 */
const example: WorkedExample = {
  id: 'f2-landmarks',
  for: ['F2.string6-naturals'],
  title: 'Landmarks on string 6',
  idea: 'The markers at frets 3, 5 and 7 are G, A and B on string 6. Recall them; don’t count from the nut.',
  // From the nut, so the markers can be counted and the window doesn't point at the answer.
  range: { from: 0, to: 9 },
  steps: [
    landmarkStep('G', 6, 'the first marker'),
    landmarkStep('A', 6, 'the second marker'),
    landmarkStep('B', 6, 'the third marker'),
  ],
};

export default example;
