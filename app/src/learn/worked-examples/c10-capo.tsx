import { chromaOf, majorKey, noteAt, shapeKey, soundingKey, type Position } from '../../theory';
import type { ExampleStep, WorkedExample } from './types';

const WORDS = ['no', 'one', 'two', 'three', 'four', 'five'];

const frets = (n: number) => `${WORDS[n] ?? n} fret${n === 1 ? '' : 's'}`;

/** "an A shape", "a G shape": the article goes by the letter's sound. */
const aShape = (key: string) => `${/^[AEF]/.test(key) ? 'an' : 'a'} ${key} shape`;

/**
 * Under a capo on `capo`, the root of an open major shape (`root`, as the
 * open chord has it) sounds `capo` frets higher. The answer is that cell, and
 * the sounding key comes from `theory/` and must be the note there. The trap
 * is the same count downwards: transposing in the wrong direction
 * (research/03 C10).
 */
export function capoStep(root: Position, capo: number): ExampleStep {
  const shape = majorKey(noteAt(root).pc);
  const sounding = soundingKey(shape, capo).tonic;
  const answer = { string: root.string, fret: root.fret + capo };
  if (chromaOf(noteAt(answer).pc) !== chromaOf(sounding)) {
    throw new Error(`${shape.tonic} shapes, capo ${capo}, don't sound ${sounding}`);
  }
  const up = frets(capo);
  const step: ExampleStep = {
    prompt: `Capo on fret ${capo}, playing ${aShape(shape.tonic)}: find the root it sounds, on string ${root.string}.`,
    given: [root],
    answer,
    explain:
      `The capo raises every note ${up}, so the ${shape.tonic} shape’s root moves from fret ${root.fret} up to fret ${answer.fret}: ${sounding}. ` +
      `${shape.tonic} shapes with a capo on fret ${capo} sound in ${sounding}.`,
    hint: `Count up: ${up} above the shape’s root.`,
  };
  const below = root.fret - capo;
  if (below < 0) return step;
  const wrong = shapeKey(shape, capo).tonic;
  return {
    ...step,
    trap: {
      at: { string: root.string, fret: below },
      name: wrong,
      message: `That's ${wrong}: ${up} below the shape. For the key that sounds, count up from ${shape.tonic}: ${shape.tonic} shapes, capo ${capo}, sound in ${sounding}. Count down only to pick shapes for a song’s key.`,
    },
  };
}

/**
 * C10: a capo is a movable nut. The shape keeps its name, and the key that
 * sounds is the shape's key counted up by the capo fret. Each step moves an
 * open shape's root up under a capo: G, D, then A, on new strings and capo
 * frets (rule 12), with the wrong-direction count as the trap. The shapes
 * and capos are picked so every answer and trap is a natural note, as the
 * neck labels it.
 */
const example: WorkedExample = {
  id: 'c10-capo',
  for: ['C10'],
  title: 'Capo: count up',
  idea: 'A capo raises every note by its fret number. Your fingers still make the shape you know, so counting up from the shape’s key gives the key that sounds. To pick shapes for a song’s key, count down from it instead.',
  steps: [
    capoStep({ string: 6, fret: 3 }, 2),
    capoStep({ string: 2, fret: 3 }, 3),
    capoStep({ string: 3, fret: 2 }, 2),
  ],
};

export default example;
