import type { Outcomes } from './types';

/** TAB (docs/design/tab-track.md: read a line and a number as a place, at speed). */
const outcomes: Outcomes = {
  'TAB.string1':
    'Read a number on the top line of tab as that fret on the high e string, at speed.',
  'TAB.string6':
    'Read the bottom line of tab as the low E string, at speed, without mixing it up with the top line.',
  'TAB.string2': 'Read a number on tab line 2 as that fret on the B string, at speed.',
  'TAB.string5': 'Read a number on tab line 5 as that fret on the A string, at speed.',
  'TAB.string3': 'Read a number on tab line 3 as that fret on the G string, at speed.',
  'TAB.string4': 'Read a number on tab line 4 as that fret on the D string, at speed.',
};

export default outcomes;
