import type { Outcomes } from './types';

/** C1 (research/03: "tap every octave of a note in a region; find all Gs in under 15s"). */
const outcomes: Outcomes = {
  'C1.octaves':
    'Find the same note an octave higher or lower from any fret, using the two octave shapes.',
  'C1.octaves-gb-shift':
    'Find octaves that cross from the G string to the B string, where the shape moves up one fret.',
  'C1.double-octaves':
    'Find a note two octaves away between the two E strings, which share every note name fret for fret.',
  'C1.every-octave':
    'Tap every place a note sits on the neck, such as all the Gs, in under 15 seconds.',
};

export default outcomes;
