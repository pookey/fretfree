import type { Outcomes } from './types';

/** I3 (research/03: "count sharps and flats; give the relative minor and the V"). */
const outcomes: Outcomes = {
  'I3.sharp-signatures':
    'Say how many sharps a major key has and which ones, and name the key from its sharps.',
  'I3.flat-signatures':
    'Say how many flats a major key has and which ones, and name the key from its flats.',
  'I3.dominants': 'Name the V of any major key: the next key round the circle of fifths.',
  'I3.relative-minors':
    'Name the relative minor of any major key: the minor key that uses exactly the same notes.',
};

export default outcomes;
