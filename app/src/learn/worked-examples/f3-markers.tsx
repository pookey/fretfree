import { INLAY_FRETS, STANDARD_TUNING, noteAt, type Position } from '../../theory';
import { spellFrom } from './f1-alphabet';
import type { ExampleStep, WorkedExample } from './types';

const DOTS = INLAY_FRETS.filter((f) => f <= 12);
const ORDINAL = ['first', 'second', 'third', 'fourth', 'fifth'];

/** "7th": how a marker is named. */
const nth = (fret: number) => `${fret}${fret === 3 ? 'rd' : 'th'}`;

/** F3: find a marker's fret by counting the dots from the nut. */
export function markerStep(fret: number, string: number): ExampleStep {
  const i = DOTS.indexOf(fret);
  if (i < 0) throw new RangeError(`Fret ${fret} has no marker`);
  const which = fret === 12 ? 'the double dot' : `the ${ORDINAL[i]} dot from the nut`;
  return {
    prompt: `Find the ${nth(fret)}-fret marker on string ${string}.`,
    given: [],
    answer: { string, fret },
    explain: `Count the dots from the nut: ${DOTS.slice(0, i + 1).join(', ')}. The ${nth(fret)}-fret marker is ${which}.`,
    hint: `${which[0]!.toUpperCase()}${which.slice(1)}.`,
  };
}

/**
 * F3: the same note an octave higher, 12 frets up the same string. The open
 * string repeats at the double dot; any other fret repeats 12 frets past it,
 * so the trap there is fret 12 itself: the open string's octave, taken for
 * every note's.
 */
export function repeatStep(from: Position): ExampleStep {
  const answer = { string: from.string, fret: from.fret + 12 };
  const pc = noteAt(from, STANDARD_TUNING).pc;
  const dot = DOTS.indexOf(from.fret);
  const past = dot >= 0 && from.fret < 12 ? `, the ${ORDINAL[dot]} dot past the double dot` : '';
  const step: ExampleStep = {
    prompt: `Find this ${pc} an octave higher, on string ${from.string}.`,
    given: [from],
    answer,
    explain:
      from.fret === 0
        ? `The double dot at fret 12 repeats the open strings an octave higher: ${pc} again.`
        : `The neck repeats from the 12th fret: ${from.fret} + 12 = ${answer.fret}${past}. ${pc} again, an octave higher.`,
    hint: from.fret === 0 ? 'The double dot.' : `Twelve frets up: ${from.fret} + 12.`,
  };
  if (from.fret === 0) return step;
  const at = { string: from.string, fret: 12 };
  const name = spellFrom(from, at);
  return {
    ...step,
    trap: {
      at,
      name,
      message: `That’s ${name}, the open string’s octave. Fret 12 repeats the open string; fret ${from.fret} repeats 12 frets further on, at fret ${answer.fret}.`,
    },
  };
}

/**
 * F3: the fret markers and the 12th-fret repeat. A fretted repeat is worked,
 * counting the dots past the double dot, with fret 12 as the ghost; the faded
 * stage finds a marker; the last repeats another fretted note, where the
 * double dot is the trap again.
 */
const example: WorkedExample = {
  id: 'f3-markers',
  for: ['F3.markers', 'F3.repeat-12'],
  title: 'Fret markers and the 12th fret',
  idea: 'Dots mark frets 3, 5, 7 and 9, and a double dot fret 12. From there the neck repeats an octave higher: fret 15 is fret 3 again.',
  // From the nut, so the dots can be counted, to a fret past the furthest answer.
  range: { from: 0, to: 18 },
  steps: [repeatStep({ string: 6, fret: 3 }), markerStep(9, 2), repeatStep({ string: 4, fret: 5 })],
};

export default example;
