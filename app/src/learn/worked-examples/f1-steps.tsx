import { NATURAL_PCS, STANDARD_TUNING, noteAt, type Position } from '../../theory';
import { spellFrom } from './f1-alphabet';
import type { ExampleStep, WorkedExample } from './types';

const SIZE = { 1: 'half', 2: 'whole' } as const;

const atFret = (fret: number) => (fret === 0 ? 'on the open string' : `at fret ${fret}`);

/**
 * F1: a half or whole step from a note, on the same string: one fret or two.
 * Up is spelt with sharps, down with flats. A whole step across E–F or B–C
 * gets a trap: the natural one fret away, which is only a half step
 * (research/03 F1: no sharp between them).
 */
export function halfWholeStep(from: Position, semitones: 1 | 2 | -1 | -2): ExampleStep {
  const answer = { string: from.string, fret: from.fret + semitones };
  if (answer.fret < 0) throw new RangeError(`No fret ${answer.fret} on string ${from.string}`);
  const up = semitones > 0;
  const size = SIZE[Math.abs(semitones) as 1 | 2];
  const way = up ? 'up' : 'down';
  const a = noteAt(from, STANDARD_TUNING).pc;
  const b = noteAt(answer, STANDARD_TUNING, up ? 'sharp' : 'flat').pc;
  const frets = size === 'half' ? 'one fret' : 'two frets';
  const sign =
    size === 'half'
      ? up
        ? ' A sharp raises a note a half step.'
        : ' A flat lowers a note a half step.'
      : '';
  const step: ExampleStep = {
    prompt: `Find a ${size} step ${up ? 'above' : 'below'} ${a} on string ${from.string}.`,
    given: [from],
    answer,
    explain: `A ${size} step is ${frets}: ${a} ${atFret(from.fret)}, ${way} ${frets} to ${b} ${atFret(answer.fret)}.${sign}`,
    hint: `${frets[0]!.toUpperCase()}${frets.slice(1)} ${way}.`,
  };
  const at = { string: from.string, fret: from.fret + Math.sign(semitones) };
  const near = noteAt(at, STANDARD_TUNING).pc;
  if (size === 'half' || !NATURAL_PCS.includes(a) || !NATURAL_PCS.includes(near)) return step;
  const name = spellFrom(from, at);
  const pair = up ? `${a}–${name}` : `${name}–${a}`;
  return {
    ...step,
    trap: {
      at,
      name,
      message: `That’s ${name}, only a half step ${up ? 'above' : 'below'} ${a}: ${pair} has no sharp between them. A whole step is two frets, so it’s ${b}.`,
    },
  };
}

/**
 * F1: half and whole steps as frets. A whole step up from E is worked, with
 * E–F's missing sharp as the ghost; a half step up is faded; a whole step
 * down from C meets B–C's unaided.
 */
const example: WorkedExample = {
  id: 'f1-steps',
  for: ['F1.half-steps', 'F1.whole-steps'],
  title: 'Half and whole steps',
  idea: 'One fret is a half step; two frets are a whole step. A sharp raises a note a half step, a flat lowers it one.',
  steps: [
    halfWholeStep({ string: 6, fret: 0 }, 2),
    halfWholeStep({ string: 5, fret: 3 }, 1),
    halfWholeStep({ string: 3, fret: 5 }, -2),
  ],
};

export default example;
