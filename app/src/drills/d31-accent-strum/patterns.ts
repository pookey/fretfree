import type { AccentPattern, CountPattern } from '../../engine/items/accent';
import {
  TRIPLET,
  beats,
  clickMeter,
  countSyllables,
  meterKind,
  parseTimeSignature,
  type NoteValue,
  type RhythmEvent,
  type TimeSignature,
} from '../../theory';
import type { ClickMeter } from '../../timing/meter';

/**
 * D31's bars: one bar of a meter on a grid of steps, the strokes that are
 * played and the ones accented. A step is `1 / stepsPerPulse` of the click's
 * pulse (a quarter in 4/4, an eighth in 6/8), so step `s` of bar `b` sits at
 * pulse `b × top + s / stepsPerPulse`.
 *
 * Counts (T3) play every step, each beat accented. Accent patterns (T5) are
 * written out: where the downbeat falls, the backbeat, strums, groupings.
 */

export type Stroke = 'down' | 'up';

export interface Bar {
  /** As the learner reads it: `6/8`, `7/8`. */
  meter: string;
  ts: TimeSignature;
  /** The click's grouping: the downbeat, and each felt beat of a compound or odd meter. */
  click: ClickMeter;
  /** Steps per click pulse: 1, or 2–4 for a grid finer than the pulse. */
  stepsPerPulse: number;
  /** Steps in a bar. */
  steps: number;
  /** The steps played, ascending. */
  hits: readonly number[];
  /** The steps played strong, a subset of `hits`. */
  accents: readonly number[];
  /** For a strumming pattern, the stroke on each step; `null` for taps. */
  strokes: readonly Stroke[] | null;
  /** How each step is counted: "1 e & a", "1 la li" (`theory/rhythm.ts`). */
  syllables: readonly string[];
  /** The steps that start a felt beat, where the grid leaves a gap. */
  beatStarts: readonly number[];
  /** What the prompt calls it. */
  name: string;
  /** How to play it, shown under the prompt. It never gives the count away. */
  hint: string;
}

interface Spec {
  ts: string;
  stepsPerPulse: number;
  hits?: readonly number[];
  accents: readonly number[];
  strum?: boolean;
  name: string;
  hint: string;
}

/** `ts.top × stepsPerPulse` steps, or the given hits. */
const every = (n: number) => Array.from({ length: n }, (_, i) => i);

const ACCENTS: Record<AccentPattern, Spec> = {
  '4/4:downbeat': {
    ts: '4/4',
    stepsPerPulse: 1,
    accents: [0],
    name: 'beat 1 of 4/4',
    hint: 'Tap every beat. Make the first beat of each bar strong and the other three soft.',
  },
  '3/4:downbeat': {
    ts: '3/4',
    stepsPerPulse: 1,
    accents: [0],
    name: 'beat 1 of 3/4',
    hint: 'A waltz: tap every beat, strong on the first of each bar, soft on the other two.',
  },
  '2/4:downbeat': {
    ts: '2/4',
    stepsPerPulse: 1,
    accents: [0],
    name: 'beat 1 of 2/4',
    hint: 'A march: tap every beat, strong on the first of each bar and soft on the second.',
  },
  '4/4:backbeat': {
    ts: '4/4',
    stepsPerPulse: 1,
    accents: [1, 3],
    name: 'the backbeat in 4/4',
    hint: 'Tap every beat, strong on 2 and 4, where the snare drum hits. Keep 1 and 3 soft.',
  },
  '12/8:backbeat': {
    ts: '12/8',
    stepsPerPulse: 1,
    accents: [3, 9],
    name: 'the 12/8 shuffle backbeat',
    hint: 'Four beats of three eighths. Tap every eighth, strong on the first eighth of beats 2 and 4.',
  },
  '4/4:rock-strum': {
    ts: '4/4',
    stepsPerPulse: 2,
    hits: [0, 2, 3, 5, 6, 7],
    accents: [2, 6],
    strum: true,
    name: 'a rock strum, accents on 2 and 4',
    hint: 'Down, down-up, up-down-up. The down strums on beats 2 and 4 are the strong ones.',
  },
  '3/4:waltz-strum': {
    ts: '3/4',
    stepsPerPulse: 2,
    hits: [0, 2, 3, 4, 5],
    accents: [0],
    strum: true,
    name: 'a waltz strum, accent on 1',
    hint: 'Down, down-up, down-up. One strong strum to start the bar, the rest soft.',
  },
  '6/8:strum': {
    ts: '6/8',
    stepsPerPulse: 1,
    hits: [0, 2, 3, 5],
    accents: [0, 3],
    strum: true,
    name: 'a 6/8 strum, accents on the two beats',
    hint: 'Down, up, down, up: a strong down strum on each beat, a soft up strum before the next.',
  },
  '5/4:grouping': {
    ts: '5/4 (3+2)',
    stepsPerPulse: 1,
    accents: [0, 3],
    name: '5/4 grouped 3+2',
    hint: 'Tap every beat, strong at the start of each group: a group of three, then two.',
  },
  '7/8:grouping': {
    ts: '7/8 (2+2+3)',
    stepsPerPulse: 1,
    accents: [0, 2, 4],
    name: '7/8 grouped 2+2+3',
    hint: 'Tap every eighth, strong at the start of each group: two, two, then three.',
  },
};

/** Names for a count's subdivision, by steps per felt beat. */
const SPLIT_NAME: Record<3 | 4, (compound: boolean) => string> = {
  3: (compound) => (compound ? 'eighths' : 'triplets'),
  4: () => 'sixteenths',
};

/** One step of the grid as a note value, for counting it with `countSyllables`. */
function stepEvent(ts: TimeSignature, stepsPerPulse: number): RhythmEvent {
  if (stepsPerPulse === 3) return { value: (ts.bottom * 2) as NoteValue, tuplet: TRIPLET };
  return { value: (ts.bottom * stepsPerPulse) as NoteValue };
}

/** Down on a beat or the first eighth of a compound beat, up on the step before the next. */
function strokeAt(ts: TimeSignature, stepsPerPulse: number, step: number): Stroke {
  if (meterKind(ts) === 'simple') return step % stepsPerPulse === 0 ? 'down' : 'up';
  return step % 3 === 2 ? 'up' : 'down';
}

function build(spec: Spec): Bar {
  const ts = parseTimeSignature(spec.ts);
  const { stepsPerPulse } = spec;
  const steps = ts.top * stepsPerPulse;
  const grid = Array<RhythmEvent>(steps).fill(stepEvent(ts, stepsPerPulse));
  let start = 0;
  const beatStarts = beats(ts).map((b) => {
    const at = start;
    start += b.pulses * stepsPerPulse;
    return at;
  });
  const hits = spec.hits ?? every(steps);
  return {
    meter: `${ts.top}/${ts.bottom}`,
    ts,
    click: clickMeter(ts),
    stepsPerPulse,
    steps,
    hits,
    accents: spec.accents,
    strokes: spec.strum ? every(steps).map((s) => strokeAt(ts, stepsPerPulse, s)) : null,
    syllables: countSyllables(grid, ts),
    beatStarts,
    name: spec.name,
    hint: spec.hint,
  };
}

function countSpec(pattern: CountPattern): Spec {
  const [meter, split] = pattern.split(':') as [string, string];
  const ts = parseTimeSignature(meter);
  const perBeat = Number(split) as 3 | 4;
  const beat = beats(ts)[0]!;
  const stepsPerPulse = perBeat / beat.pulses;
  const compound = beat.pulses === 3;
  const starts = beats(ts).map((_, i) => i * perBeat);
  return {
    ts: meter,
    stepsPerPulse,
    accents: starts,
    name: `${meter} in ${SPLIT_NAME[perBeat](compound)}`,
    hint:
      perBeat === 4
        ? 'Four even taps to a beat. Count them under your breath, strong on each beat, soft between.'
        : compound
          ? `${beats(ts).length} beats of three eighths. Count them, tap every eighth, strong on each beat.`
          : 'Three even taps to a beat. Count them under your breath, strong on each beat, soft between.',
  };
}

export function countBar(pattern: CountPattern): Bar {
  return build(countSpec(pattern));
}

export function accentBar(pattern: AccentPattern): Bar {
  return build(ACCENTS[pattern]);
}
