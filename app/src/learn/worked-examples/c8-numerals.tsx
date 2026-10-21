import {
  chordFromNumeral,
  degreeOrdinal,
  intervalInfo,
  majorKey,
  noteAt,
  type Position,
} from '../../theory';
import { describeShape, shapeStep } from './shapes';
import type { ExampleStep, WorkedExample } from './types';

/** The two chords that make I–IV–V with the tonic, and the interval to their roots. */
const PRIMARY = { IV: 'P4', V: 'P5' } as const;

export type PrimaryNumeral = keyof typeof PRIMARY;

/**
 * The root of `numeral` in the major key on `tonic`, found on `toString` as
 * an interval shape from the tonic. The chord comes from `theory/`, and the
 * shape must land on its root, so the copy can't drift from the maths. With
 * `trap`, the other primary chord's root is the trap: IV and V are the
 * confusable pair of three-chord songs (research/02 rule 6).
 */
export function numeralStep(
  tonic: Position,
  numeral: PrimaryNumeral,
  toString: number,
  opts: { trap?: boolean } = {},
): ExampleStep {
  const key = noteAt(tonic).pc;
  const chordOf = (n: PrimaryNumeral) => chordFromNumeral(majorKey(key), n);
  const chord = chordOf(numeral);
  const step = shapeStep(tonic, PRIMARY[numeral], toString);
  if (step.trap || noteAt(step.answer).pc !== chord.root) {
    throw new RangeError(
      `${numeral} in ${key} isn't ${noteAt(step.answer).pc}, or the shape shifts`,
    );
  }
  const interval = intervalInfo(PRIMARY[numeral]).long;
  const move = describeShape(tonic.string, toString, step.answer.fret - tonic.fret);
  const degree = `${degreeOrdinal(chord.degree)} degree`;
  const result: ExampleStep = {
    ...step,
    prompt: `In ${key} major, find the root of the ${numeral} chord on string ${toString}.`,
    explain: `${step.explain} ${numeral} is the chord on the ${degree}, so in ${key} major it's ${chord.symbol}: its root is the ${interval} above ${key}.`,
    hint: `${numeral} is a ${interval} above the tonic: ${move}.`,
  };
  if (!opts.trap) return result;
  const other: PrimaryNumeral = numeral === 'IV' ? 'V' : 'IV';
  const decoy = shapeStep(tonic, PRIMARY[other], toString).answer;
  const name = chordOf(other).root;
  return {
    ...result,
    trap: {
      at: decoy,
      name,
      message: `That's ${name}, the root of ${other}. ${numeral} is the chord on the ${degree}: ${chord.root}, ${move}.`,
    },
  };
}

/**
 * C8 stage 1: I, IV and V in C, the three chords of three-chord songs. A
 * numeral is a scale degree, and its chord's root is an interval shape from
 * the tonic: IV a 4th up, V a 5th up. The learner finds both, then the IV
 * again from a root on another string (rule 12), with IV and V traps.
 */
const example: WorkedExample = {
  id: 'c8-numerals',
  for: ['C8.numerals-major'],
  title: 'I, IV and V in C',
  idea: 'A Roman numeral names the chord on that degree of the key. In C major, I is C, IV is F (a 4th up) and V is G (a 5th up), all major: the three chords of three-chord songs.',
  steps: [
    numeralStep({ string: 6, fret: 8 }, 'IV', 5),
    numeralStep({ string: 6, fret: 8 }, 'V', 5, { trap: true }),
    numeralStep({ string: 5, fret: 3 }, 'IV', 4, { trap: true }),
  ],
};

export default example;
