import { notesOn } from './diagrams';
import type { ConceptIntro } from './types';

/**
 * C1: one octave shape, two strings up from strings 6 and 5, and its reverse.
 * The skill also drills the shape three strings up (6 → 3, three frets back);
 * its worked rep shows that one, rather than a rule this intro would have to
 * qualify. The G–B shift is its own skill.
 */
const intro: ConceptIntro = {
  id: 'c1-octaves',
  for: ['C1.octaves'],
  title: 'The octave shape',
  text: 'An octave is the same letter, higher in pitch. One octave shape: from string 6 or 5, go two strings thinner and two frets higher. Reverse it to go down: two strings thicker, two frets lower.',
  diagram: {
    kind: 'neck',
    range: { from: 1, to: 7 },
    markers: [...notesOn(6, [3], 'root'), ...notesOn(4, [5])],
    label: 'G at string 6, fret 3, and its octave, G at string 4, fret 5',
  },
};

export default intro;
