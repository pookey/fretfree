import { notesOn } from './diagrams';
import type { ConceptIntro } from './types';

/**
 * C3: 3rds as shapes, with the G–B shift said up front (research/03: "the
 * G–B shift breaks octave and interval shapes. Teach it explicitly").
 */
const intro: ConceptIntro = {
  id: 'c3-thirds',
  for: ['C3.thirds'],
  title: 'Major and minor 3rds',
  text: 'An interval is the distance between two notes. A major 3rd is 4 frets higher; a minor 3rd, 3. On the next thinner string a major 3rd is one fret back, but from string 3 to 2, the same fret.',
  diagram: {
    kind: 'neck',
    range: { from: 1, to: 6 },
    markers: [
      ...notesOn(5, [3], 'root'),
      ...notesOn(4, [2], 'third'),
      ...notesOn(3, [5], 'root'),
      ...notesOn(2, [5], 'third'),
    ],
    label:
      'C at string 5, fret 3, with its major 3rd, E, one fret back on string 4; C at string 3, fret 5, with E on the same fret of string 2',
  },
};

export default intro;
