import type { Outcomes } from './types';

/** I5 (research/03: "classify a chord's function; spot the borrowed chord"). */
const outcomes: Outcomes = {
  'I5.function-major':
    'Say whether a chord in a major key feels like home, moves away, or pulls back home.',
  'I5.function-minor':
    'Say whether a chord in a minor key feels like home, moves away, or pulls back home.',
  'I5.secondary-dominants':
    'Name the 7th chord that leads into any chord of a key, such as A7 into Dm in C.',
  'I5.borrowed': 'Spot a chord borrowed from the minor key, such as ♭VII in a major-key song.',
  'I5.substitutes': 'Swap a dominant 7th for its tritone substitute, such as D♭7 for G7.',
};

export default outcomes;
