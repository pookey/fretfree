import { Interval, Note } from 'tonal';
import { chordToneOf, chromaOf, midiAt, nameChord, noteAt, type Position } from '../../theory';
import { shapeStep } from './shapes';
import type { ExampleStep, WorkedExample } from './types';

type SeventhChord = '7' | 'maj7';

const OTHER: Readonly<Record<SeventhChord, SeventhChord>> = { '7': 'maj7', maj7: '7' };

const SEVENTH = {
  '7': { degree: 'b7', interval: 'm7', word: 'flat 7th', below: 'a whole step' },
  maj7: { degree: '7', interval: 'M7', word: 'major 7th', below: 'a half step' },
} as const;

/**
 * The 7th of a 7 or maj7 chord on `root`, found on `toString` as an interval
 * shape. The trap is the other chord's 7th, a fret away: the b7 in "7"
 * mistaken for the 7 in "maj7", or back (research/03 C5). The shape must not
 * cross the G–B pair, whose trap is the unshifted shape instead.
 */
export function seventhStep(root: Position, chord: SeventhChord, toString: number): ExampleStep {
  const rootPc = noteAt(root).pc;
  const own = SEVENTH[chord];
  const other = SEVENTH[OTHER[chord]];
  const step = shapeStep(root, own.interval, toString);
  if (step.trap) throw new RangeError('A 7th across the G–B pair has a different trap');
  const note = chordToneOf(rootPc, chord, own.degree) ?? '';
  if (chromaOf(note) !== midiAt(step.answer) % 12) {
    throw new Error(`${note} is not the ${own.word} of ${rootPc}`);
  }
  // The other 7th is a fret up (maj7) or back (7), spelt as the interval it forms.
  const at = { string: toString, fret: step.answer.fret + (chord === '7' ? 1 : -1) };
  const name = Note.transpose(rootPc, Interval.fromSemitones(chord === '7' ? 11 : 10));
  const symbol = nameChord(rootPc, chord);
  const otherSymbol = nameChord(rootPc, OTHER[chord]);
  return {
    ...step,
    prompt: `Find the 7th of ${symbol} on string ${toString}.`,
    explain: `${step.explain} ${symbol} takes the ${own.word}: ${note}, ${own.below} below ${rootPc}.`,
    trap: {
      at,
      name,
      message: `That's ${name}: the ${other.word}, the 7 in ${otherSymbol}. ${symbol} takes the ${own.word}, ${note}.`,
    },
  };
}

/**
 * C5: the 7 in "A7" is a flat 7th; only maj7 takes the major 7th. The two
 * sit a fret apart, so the example pairs them (research/02 rule 6).
 */
const example: WorkedExample = {
  id: 'c5-seventh-shapes',
  for: ['C5.tones-sevenths', 'C5.sevenths', 'C5.name-sevenths'],
  title: 'The 7 in “7” and in “maj7”',
  idea: 'A7’s 7th is a flat 7th, a whole step below the root. Only Amaj7 takes the major 7th, a half step below.',
  steps: [
    seventhStep({ string: 6, fret: 5 }, '7', 4),
    seventhStep({ string: 5, fret: 5 }, '7', 3),
    seventhStep({ string: 5, fret: 3 }, 'maj7', 3),
  ],
};

export default example;
