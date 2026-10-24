import type { Outcomes } from './types';

/** T6 (research/03: "find bar 1 of a pickup melody; follow repeat signs"). */
const outcomes: Outcomes = {
  'T6.pickups': 'Find bar 1 of a tune that starts with a pickup, and count the pickup in.',
  'T6.repeats':
    'Follow repeat signs: back to the begin repeat, or to the start when there is none.',
  'T6.endings': 'Play the 1st ending the first time, then skip to the 2nd ending.',
  'T6.pickups-compound': 'Find bar 1 and count in a 6/8 tune that starts with a pickup.',
};

export default outcomes;
