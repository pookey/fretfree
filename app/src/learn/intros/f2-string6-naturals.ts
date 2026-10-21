import { notesOn } from './diagrams';
import type { ConceptIntro } from './types';

/** F2: the letters on string 6, to recall rather than count up from the nut (research/03). */
const intro: ConceptIntro = {
  id: 'f2-string6-naturals',
  for: ['F2.string6-naturals'],
  title: 'Letters on string 6',
  text: 'Played open, string 6 (the thickest) is E. Up the neck, the letters follow in order: F at fret 1, G at 3, A at 5, B at 7, C at 8, D at 10, E at 12.',
  diagram: {
    kind: 'neck',
    range: { from: 0, to: 12 },
    markers: notesOn(6, [0, 1, 3, 5, 7, 8, 10, 12]),
    label: 'String 6: E open, F at fret 1, G at 3, A at 5, B at 7, C at 8, D at 10, E at 12',
  },
};

export default intro;
