import {
  STANDARD_TUNING,
  intervalFromRoot,
  intervalInfo,
  intervalShape,
  noteAt,
  positionsOfPitchClass,
  type IntervalName,
  type Position,
} from '../../theory';
import type { ExampleStep } from './types';

/**
 * Step builders for worked examples. Answers, shapes and the G–B shift come
 * from `theory/`, so example copy can't drift from the maths. Examples teach
 * standard tuning: the G–B shift is a property of it.
 */

const tuning = STANDARD_TUNING;
const pcAt = (p: Position) => noteAt(p, tuning).pc;

const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six'];

function count(n: number, unit: string): string {
  return `${WORDS[n] ?? n} ${unit}${n === 1 ? '' : 's'}`;
}

/** "two strings up, three frets up" (string 1 is the highest, so up = lower number). */
export function describeShape(fromString: number, toString: number, fretOffset: number): string {
  const strings = fromString - toString;
  const across =
    strings === 0
      ? 'same string'
      : `${count(Math.abs(strings), 'string')} ${strings > 0 ? 'up' : 'down'}`;
  const along =
    fretOffset === 0
      ? 'same fret'
      : `${count(Math.abs(fretOffset), 'fret')} ${fretOffset > 0 ? 'up' : 'back'}`;
  return `${across}, ${along}`;
}

const GB_WHY =
  'The B string is tuned a major 3rd above G, not a 4th like the others, so a shape that crosses the G–B pair moves up one fret.';

function withArticle(long: string): string {
  return `${/^[aeiou]/.test(long) ? 'an' : 'a'} ${long}`;
}

/**
 * The upper note of `interval` above `root` on `toString`, as a step. A shape
 * that crosses the G–B pair gets a trap: the cell the all-fourths shape would
 * give, which is the misconception research/03 says to target.
 */
export function shapeStep(root: Position, interval: IntervalName, toString: number): ExampleStep {
  const shape = intervalShape(interval, root.string, toString, tuning);
  const answer = { string: toString, fret: root.fret + shape.fretOffset };
  const target = intervalInfo(interval);
  const rootPc = pcAt(root);
  const what = interval === 'P8' ? `the octave of ${rootPc}` : `the ${target.long} above ${rootPc}`;
  const move = describeShape(root.string, toString, shape.fretOffset);
  const step: ExampleStep = {
    prompt: `Find ${what} on string ${toString}.`,
    given: [root],
    answer,
    explain:
      `${rootPc} on string ${root.string}, fret ${root.fret} → ${pcAt(answer)} on string ${toString}, fret ${answer.fret}: ${move}.` +
      (shape.gbShift ? ` ${GB_WHY}` : ''),
    hint: `${move[0]?.toUpperCase()}${move.slice(1)}.`,
  };
  if (!shape.gbShift) return step;
  // Going up the strings the shift adds a fret, so the unshifted shape is one fret lower.
  const at = { string: toString, fret: answer.fret + (toString < root.string ? -1 : 1) };
  const got = intervalInfo(intervalFromRoot(root, at, tuning)).long;
  return {
    ...step,
    trap: {
      at,
      message: `Fret ${at.fret} is the shape without the G–B shift. That's ${pcAt(at)}: ${withArticle(got)}, not ${withArticle(target.long)}.`,
    },
  };
}

/**
 * Find a natural note on a string from its nearest inlay landmark (F2). The
 * answer is the note's lowest fretted position on the string.
 */
export function landmarkStep(pc: string, string: number, landmark: string): ExampleStep {
  const answer = positionsOfPitchClass(pc, { tuning, strings: [string] }).find((p) => p.fret > 0);
  if (!answer) throw new RangeError(`No ${pc} on string ${string}`);
  return {
    prompt: `Find ${pc} on string ${string}.`,
    given: [],
    answer,
    explain: `${pc} is at fret ${answer.fret}: ${landmark}.`,
    hint: `${landmark[0]?.toUpperCase()}${landmark.slice(1)}.`,
  };
}
