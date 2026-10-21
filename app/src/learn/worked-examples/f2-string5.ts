import { letterStep } from './f1-alphabet';
import { landmarkStep } from './shapes';
import type { WorkedExample } from './types';

/**
 * F2: recall naturals on string 5 from the inlay markers rather than counting
 * up from the nut (research/03), as `f2-landmarks` does for string 6, and
 * step off them to their neighbours. Stepping from E to F is worked, with
 * the fourth marker's F# as the ghost (no sharp between E–F); D is recalled
 * at the second marker; then B is found from C, where Bb is the trap.
 */
const example: WorkedExample = {
  id: 'f2-string5',
  for: ['F2.string5-naturals'],
  title: 'Landmarks on string 5',
  idea: 'The markers at frets 3, 5 and 7 are C, D and E on string 5. Recall them, then step off them: B–C and E–F are one fret apart.',
  // From the nut, so the markers can be counted and the window doesn't point at the answer.
  range: { from: 0, to: 9 },
  steps: [
    {
      ...letterStep({ string: 5, fret: 7 }, 1),
      prompt: 'Find F on string 5, from E at the third marker.',
    },
    landmarkStep('D', 5, 'the second marker'),
    {
      ...letterStep({ string: 5, fret: 3 }, -1),
      prompt: 'Find B on string 5, from C at the first marker.',
    },
  ],
};

export default example;
