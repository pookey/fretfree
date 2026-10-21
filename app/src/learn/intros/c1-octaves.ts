import { notesOn } from './diagrams';
import type { ConceptIntro } from './types';

/**
 * C1: the octave shape from strings 6 and 5. Strings 4 and 3 cross the G–B
 * pair and shift a fret (research/03's misconception); that skill gets its
 * own intro rather than a rule this one would have to qualify.
 */
const intro: ConceptIntro = {
  id: 'c1-octaves',
  for: ['C1.octaves'],
  title: 'The octave shape',
  text: 'An octave is the same letter, higher in pitch. From a note on string 6 or 5, its octave is two strings thinner and two frets higher: G at string 6, fret 3 → G at string 4, fret 5.',
  diagram: {
    kind: 'neck',
    range: { from: 1, to: 7 },
    markers: [...notesOn(6, [3], 'root'), ...notesOn(4, [5])],
    label: 'G at string 6, fret 3, and its octave, G at string 4, fret 5',
  },
};

export default intro;
