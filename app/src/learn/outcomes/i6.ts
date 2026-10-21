import type { Outcomes } from './types';

/** I6 (research/03: "hear I–V–vi–IV vs vi–IV–I–V"; it runs from day one). */
const outcomes: Outcomes = {
  'I6.intervals-fourths-fifths': 'Hear whether two notes are a 4th, a 5th or an octave apart.',
  'I6.intervals-thirds': 'Hear a major 3rd from a minor 3rd.',
  'I6.intervals-seconds-sixths': 'Hear major and minor 2nds and 6ths among the intervals you know.',
  'I6.intervals-sevenths':
    'Hear 7ths and the tritone, so every interval inside the octave has a sound.',
  'I6.intervals-falling': 'Name an interval when the second note is lower, as melodies often go.',
  'I6.intervals-together': 'Name an interval when both notes sound at once, as they do in a chord.',
  'I6.chords-major-minor': 'Hear whether a chord is major or minor.',
  'I6.chords-diminished-augmented':
    'Hear diminished and augmented chords and tell them from major and minor.',
  'I6.chords-sevenths': 'Hear which kind of 7th chord is playing.',
  'I6.progressions-pop': 'Hear I–V–vi–IV from vi–IV–I–V and the other pop progressions.',
  'I6.progressions-cadences':
    'Hear a ii–V–I and the minor vamp, and tell them from pop progressions.',
  'I6.progressions-blues': 'Hear a 12-bar blues and tell it from the other progressions you know.',
  'I6.ear-find': 'Hear a note over an open string and find it on that string by ear.',
};

export default outcomes;
