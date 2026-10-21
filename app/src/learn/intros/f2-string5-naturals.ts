import { notesOn } from './diagrams';
import type { ConceptIntro } from './types';

/** F2: the letters on string 5, to recall rather than count up from the nut (research/03). */
const intro: ConceptIntro = {
  id: 'f2-string5-naturals',
  for: ['F2.string5-naturals'],
  title: 'Letters on string 5',
  text: 'Played open, string 5 (next to the thickest) is A. Going up the neck, the letters follow in order: B at fret 2, C at 3, D at 5, E at 7, F at 8, G at 10, A again at 12.',
  diagram: {
    kind: 'neck',
    range: { from: 0, to: 12 },
    markers: notesOn(5, [0, 2, 3, 5, 7, 8, 10, 12]),
    label: 'String 5: A open, B at fret 2, C at 3, D at 5, E at 7, F at 8, G at 10, A at 12',
  },
};

export default intro;
