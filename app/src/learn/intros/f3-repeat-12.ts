import { notesOn } from './diagrams';
import type { ConceptIntro } from './types';

/** F3: the neck repeats from the 12th fret (research/03). */
const intro: ConceptIntro = {
  id: 'f3-repeat-12',
  for: ['F3.repeat-12'],
  title: 'The neck repeats at fret 12',
  text: 'At fret 12, every string plays its open note again, one octave higher: the same letter, higher in pitch. Then the pattern repeats, so fret 15 has the same note as fret 3.',
  diagram: {
    kind: 'neck',
    range: { from: 0, to: 15 },
    markers: notesOn(6, [0, 3, 12, 15]),
    label: 'String 6: E open and at fret 12, G at fret 3 and at fret 15',
  },
};

export default intro;
