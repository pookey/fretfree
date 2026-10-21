import {
  MAX_FRET,
  getProgression,
  majorKey,
  midiAt,
  noteAt,
  openStringMidi,
  progressionChords,
  type Position,
} from '../../theory';
import { describeShape } from './shapes';
import type { ExampleStep, WorkedExample } from './types';

/** The pop progression and its rotation: the C9 misconception (research/03). */
export type PopProgression = 'I-V-vi-IV' | 'vi-IV-I-V';

const ORDINAL = ['first', 'second', 'third', 'fourth'];

/** The vi chord's root is the relative minor's: three half steps below the tonic. */
const VI_BELOW_TONIC = 3;

/**
 * The root of the vi chord of `progression` in the major key on `tonic`,
 * found on `toString`. The prompt names the chord by its place in the
 * progression, so the learner has to read the numerals. A step on the
 * rotation traps the tonic on the same string: the learner who takes the
 * first chord for I (research/03 C9).
 */
export function rotationStep(
  tonic: Position,
  progression: PopProgression,
  toString: number,
): ExampleStep {
  const key = noteAt(tonic).pc;
  const { name, numerals } = getProgression(progression);
  const chords = progressionChords(majorKey(key), numerals);
  const index = numerals.indexOf('vi');
  const vi = chords[index];
  const fretOf = (midi: number) => midi - openStringMidi(toString);
  const answer = { string: toString, fret: fretOf(midiAt(tonic) - VI_BELOW_TONIC) };
  if (!vi || answer.fret < 0 || answer.fret > MAX_FRET || noteAt(answer).pc !== vi.root) {
    throw new RangeError(`No vi of ${key} on string ${toString} near fret ${tonic.fret}`);
  }
  const nth = ORDINAL[index] ?? '';
  const move = describeShape(tonic.string, toString, answer.fret - tonic.fret);
  const rotated = progression !== 'I-V-vi-IV';
  const same =
    'It’s I–V–vi–IV started from its third chord: the same four chords, in the same cycle.';
  const step: ExampleStep = {
    prompt: `${name} in ${key}: find the root of its ${nth} chord on string ${toString}.`,
    given: [tonic],
    answer,
    explain:
      `${name} in ${key} is ${chords.map((c) => c.symbol).join(', ')}. Its ${nth} chord is vi, ${vi.symbol}, ` +
      `whose root ${vi.root} is three half steps below ${key}: ${move}.${rotated ? ` ${same}` : ''}`,
    hint: `${rotated ? `${name} starts on vi. ` : ''}vi’s root is three half steps below the tonic: ${move}.`,
  };
  if (!rotated) return step;
  return {
    ...step,
    trap: {
      at: { string: toString, fret: fretOf(midiAt(tonic)) },
      name: key,
      message: `That's ${key}, the root of I. ${name} starts on vi, not I. ${same} In ${key} it starts on ${vi.symbol}.`,
    },
  };
}

/**
 * C9: I–V–vi–IV and vi–IV–I–V are rotations of each other (research/03 C9).
 * The worked step finds the vi in I–V–vi–IV; the next two find the same
 * chord as the first of vi–IV–I–V, in other keys (rule 12), where the
 * learner who takes the first chord for I taps the tonic.
 */
const example: WorkedExample = {
  id: 'c9-rotation',
  for: ['C9.pop'],
  title: 'One progression, two starting points',
  idea: 'vi–IV–I–V is I–V–vi–IV started from its third chord: the same four chords going round. In C both are C, G, Am and F; one just starts on Am.',
  steps: [
    rotationStep({ string: 5, fret: 3 }, 'I-V-vi-IV', 6),
    rotationStep({ string: 4, fret: 5 }, 'vi-IV-I-V', 5),
    rotationStep({ string: 5, fret: 5 }, 'vi-IV-I-V', 6),
  ],
};

export default example;
