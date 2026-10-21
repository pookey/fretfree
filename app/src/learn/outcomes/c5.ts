import type { Outcomes } from './types';

/** C5 (research/03: "spell Bm7; find the 3rd or ♭7 in a shape"). */
const outcomes: Outcomes = {
  'C5.triads': 'Spell any major or minor chord from its root, such as B minor: B, D and F♯.',
  'C5.sevenths':
    'Spell any 7th chord, such as Bm7, and tell the ♭7 in a “7” chord from the 7 in a “maj7”.',
  'C5.sus-add': 'Spell sus2, sus4 and add9 chords from any root.',
  'C5.tones-roots':
    'Find the root in any chord shape on the neck: the note that gives the chord its name.',
  'C5.tones-thirds': 'Find the 3rd in a chord shape: the note that makes it major or minor.',
  'C5.tones-fifths': 'Find the 5th in a chord shape, so you can see all three notes of a triad.',
  'C5.tones-sevenths':
    'Find the 3rd and 7th in a 7th-chord shape: the two notes that decide how it sounds.',
  'C5.name-triads': 'Name a major or minor chord from its shape on the neck.',
  'C5.name-sevenths': 'Name a 7, maj7, m7 or m7♭5 chord from its shape on the neck.',
  'C5.name-sus': 'Tell sus2 and sus4 chords apart from their shapes on the neck.',
  'C5.build-triads': 'Build a major or minor chord on the neck from any root, note by note.',
  'C5.build-sevenths': 'Build any of the four common 7th chords on the neck from any root.',
  'C5.build-sus': 'Build sus2 and sus4 chords on the neck from any root.',
  'C5.neck-triads': 'Tap every note of a triad across the whole neck, not just inside one shape.',
  'C5.neck-sevenths':
    'Tap every note of a 7th chord across the whole neck, not just inside one shape.',
};

export default outcomes;
