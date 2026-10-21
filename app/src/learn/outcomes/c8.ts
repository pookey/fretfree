import type { Outcomes } from './types';

/** C8 (research/03: "chords in any key; numeral ↔ chord"). */
const outcomes: Outcomes = {
  'C8.numerals-major':
    'Turn a Roman numeral into its chord in C, G or D major, and a chord into its numeral.',
  'C8.nashville':
    'Read Nashville numbers in C, G and D, so a chart like 1–4–5 becomes chords at once.',
  'C8.numerals-a-e-f': 'Turn Roman numerals into chords, and back, in A, E and F major too.',
  'C8.nashville-a-e-f': 'Read Nashville numbers as chords in A, E and F major.',
  'C8.numerals-other-keys':
    'Turn Roman numerals into chords, and back, in every major key, flat keys included.',
  'C8.nashville-other-keys': 'Read a Nashville number chart in any major key.',
};

export default outcomes;
