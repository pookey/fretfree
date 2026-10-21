import { Interval, Note } from 'tonal';
import { NATURAL_PCS, STANDARD_TUNING, chromaOf, noteAt, type Position } from '../../theory';
import type { ExampleStep, WorkedExample } from './types';

/** A natural note's name, or a throw: the alphabet steps between naturals only. */
function naturalAt(p: Position): string {
  const pc = noteAt(p, STANDARD_TUNING).pc;
  if (!NATURAL_PCS.includes(pc)) throw new RangeError(`${pc} is not a natural note`);
  return pc;
}

/** "fret 3", or "the open string" for fret 0. */
export function fretWord(fret: number): string {
  return fret === 0 ? 'the open string' : `fret ${fret}`;
}

/**
 * `at`'s note spelt as the interval it forms from `from`: two frets above B
 * is C#, never Db, so the name says which letter it belongs to.
 */
export function spellFrom(from: Position, at: Position): string {
  const semis = (((at.fret - from.fret) % 12) + 12) % 12;
  return Note.transpose(noteAt(from, STANDARD_TUNING).pc, Interval.fromSemitones(semis));
}

/**
 * F1: the next (or previous) letter of the alphabet, found on the same string.
 * Most neighbours are a whole step apart; B–C and E–F are a half step, with no
 * sharp between (research/03 F1). On those pairs the trap is the cell two
 * frets away: the learner who thinks every letter is two frets on.
 */
export function letterStep(from: Position, dir: 1 | -1): ExampleStep {
  const a = naturalAt(from);
  const i = NATURAL_PCS.indexOf(a);
  const b = NATURAL_PCS[(i + dir + 7) % 7]!;
  // B–C and E–F are a half step; every other pair of neighbours a whole step.
  const half = ((chromaOf(b) - chromaOf(a)) * dir + 12) % 12 === 1;
  const answer = { string: from.string, fret: from.fret + (half ? dir : 2 * dir) };
  if (answer.fret < 0) throw new RangeError(`No ${b} below ${a} on string ${from.string}`);
  const after = dir > 0 ? 'after' : 'before';
  const way = dir > 0 ? 'up' : 'down';
  const wraps = (dir > 0 && a === 'G') || (dir < 0 && a === 'A');
  const [lo, hi] = dir > 0 ? [a, b] : [b, a];
  const pair = `${lo}–${hi}`;
  const After = `${after[0]!.toUpperCase()}${after.slice(1)}`;
  const lead = wraps
    ? `The alphabet runs A to G and round again, so ${after} ${a} comes ${b}.`
    : `${After} ${a} comes ${b}.`;
  const step: ExampleStep = {
    prompt: `Find the letter ${after} ${a} on string ${from.string}.`,
    given: [from],
    answer,
    explain: half
      ? `${lead} That’s only a half step: there’s no sharp between ${lo} and ${hi}, so ${b} is the very next fret, ${fretWord(answer.fret)}.`
      : `${lead} That’s a whole step: two frets ${way}, to ${fretWord(answer.fret)}.`,
    hint: wraps
      ? 'The alphabet wraps round between G and A.'
      : half
        ? `${pair} has no sharp between.`
        : 'Letters are two frets apart, except B–C and E–F.',
  };
  if (!half) return step;
  const at = { string: from.string, fret: from.fret + 2 * dir };
  if (at.fret < 0) return step;
  const name = spellFrom(from, at);
  return {
    ...step,
    trap: {
      at,
      name,
      message: `That’s ${name}, two frets ${way}. ${pair} is a half step, with no sharp between them, so ${b} is the very next fret.`,
    },
  };
}

/**
 * F1: the musical alphabet and its two half-step pairs, on one string. The
 * stages wrap forwards, wrap backwards, then meet B–C unaided (rule 12: a new
 * string each time).
 */
const example: WorkedExample = {
  id: 'f1-alphabet',
  for: ['F1.alphabet', 'F1.b-c-e-f'],
  title: 'The musical alphabet',
  idea: 'Seven letters, A to G, then A again. Neighbours are two frets apart, except B–C and E–F: one fret, with no sharp between.',
  steps: [
    letterStep({ string: 6, fret: 3 }, 1),
    letterStep({ string: 3, fret: 2 }, -1),
    letterStep({ string: 5, fret: 2 }, 1),
  ],
};

export default example;
