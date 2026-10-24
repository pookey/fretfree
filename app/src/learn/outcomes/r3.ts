import type { Outcomes } from './types';

/** R3 (research/03: "read a key signature; apply it to an unaltered note"). */
const outcomes: Outcomes = {
  'R3.sharps-few':
    'Read a key signature of up to 3 sharps off the staff, and play each note in it sharp or natural.',
  'R3.flats-few':
    'Read a key signature of up to 3 flats off the staff, and play each note in it flat or natural.',
  'R3.sharps-many': 'Read a key signature of 4 to 7 sharps, and apply it to any note on the staff.',
  'R3.flats-many': 'Read a key signature of 4 to 7 flats, and apply it to any note on the staff.',
};

export default outcomes;
