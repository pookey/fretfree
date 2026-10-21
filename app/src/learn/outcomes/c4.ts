import type { Outcomes } from './types';

/** C4 (research/03: "spell any major key; ‘the 6th of E♭?’"). */
const outcomes: Outcomes = {
  'C4.sharp-keys': 'Spell the major scale of C and every sharp key, from G to C♯, note by note.',
  'C4.flat-keys': 'Spell the major scale of every flat key, from F to C♭, note by note.',
  'C4.sharp-key-degrees':
    'Name any note of a sharp key by its number straight away, such as the 6th of A.',
  'C4.flat-key-degrees':
    'Name any note of a flat key by its number straight away, such as the 6th of E♭.',
};

export default outcomes;
