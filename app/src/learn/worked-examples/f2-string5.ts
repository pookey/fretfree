import { letterStep } from './f1-alphabet';
import { landmarkStep } from './shapes';
import type { WorkedExample } from './types';

/**
 * F2: recall naturals on string 5 from the inlay markers rather than counting
 * up from the nut (research/03), as `f2-landmarks` does for string 6. The
 * last stage steps off a landmark: F is one fret past E at the third marker,
 * and the fourth marker's F# is the trap (no sharp between E–F).
 */
const example: WorkedExample = {
  id: 'f2-string5',
  for: ['F2.string5-naturals'],
  title: 'Landmarks on string 5',
  idea: 'The markers at frets 3, 5 and 7 are C, D and E on string 5. Recall them, then step to the notes beside them.',
  // From the nut, so the markers can be counted and the window doesn't point at the answer.
  range: { from: 0, to: 9 },
  steps: [
    landmarkStep('C', 5, 'the first marker'),
    landmarkStep('D', 5, 'the second marker'),
    {
      ...letterStep({ string: 5, fret: 7 }, 1),
      prompt: 'Find F on string 5, from E at the third marker.',
    },
  ],
};

export default example;
