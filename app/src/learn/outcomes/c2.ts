import type { Outcomes } from './types';

/**
 * C2 (research/03: "name a random fret in under 2s at ≥90% accuracy"), in
 * string stages (M10-12): the naturals on strings 1, 4, 3 and 2, then the
 * sharps and flats.
 */
const outcomes: Outcomes = {
  'C2.string1-naturals':
    'Name and find any natural note on the high E string, which has the same names as the low E.',
  'C2.string4-naturals':
    'Name and find any natural note on the D string, two frets up from its octave on the low E.',
  'C2.string3-naturals':
    'Name and find any natural note on the G string, two frets up from its octave on the A string.',
  'C2.string2-naturals':
    'Name and find any natural note on the B string, where octave shapes shift up one fret.',
  'C2.low-accidentals':
    'Name and find every sharp and flat on the low E and A strings, the barre-chord roots.',
  // The last stage: with it the whole neck is known.
  'C2.all-notes':
    'Name and find every sharp and flat on the D, G, B and high E strings: the whole neck, in about two seconds.',
};

export default outcomes;
