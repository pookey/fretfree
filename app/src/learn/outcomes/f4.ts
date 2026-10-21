import type { Outcomes } from './types';

/** F4 (research/03: "tap within ±30ms of a click"). */
const outcomes: Outcomes = {
  'F4.pulse': 'Tap steadily on the beat with a click: the timing every other rhythm is built on.',
  'F4.eighths':
    'Split each beat in two and tap the “&” between the beats evenly, in time with the click.',
  'F4.syncopation': 'Tap rhythms that land between the beats without losing your place in the bar.',
  'F4.strumming':
    'Strum common patterns in time by keeping your arm moving: down on every beat, up on every “&”.',
};

export default outcomes;
