import type { Outcomes } from './types';

/** R2 (research/03: "given a staff note and a position, tap its fret in under 2s"). */
const outcomes: Outcomes = {
  'R2.open': 'Read a note on the staff and play it in open position, on frets 0 to 3, at speed.',
  'R2.pos5':
    'Read a note on the staff and find it in 5th position, with the index finger on fret 5.',
  'R2.pos7':
    'Read a note on the staff and find it in 7th position, with the index finger on fret 7.',
  'R2.pos9':
    'Read a note on the staff and find it in 9th position, with the index finger on fret 9.',
  'R2.pos12':
    'Read a note on the staff and find it in 12th position, an octave above open position.',
};

export default outcomes;
