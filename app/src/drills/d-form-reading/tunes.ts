import { parseRhythm } from '../../theory';
import type { FormMarks } from './forms';

/**
 * The tunes a form card is drawn and played from, made fresh for every
 * prompt (research/02 rule 12): bars of plain rhythms (quarters, eighth
 * pairs, halves, dotted notes) and a melody on the chord of each bar. The
 * staff draws only the rhythm: the form is the point, not the pitches. The
 * pitches are for hearing it, with a bass note on each bar's downbeat, so
 * bar 1 lands with a thump the pickup never has.
 */

export interface TuneBar {
  /** The rhythm, in `theory/rhythm.ts`'s text form: `4 8 8 2`. */
  rhythm: string;
  /** One sounding pitch per note. */
  pitches: string[];
  /** The bass under the downbeat; none in a pickup. */
  bass: string | null;
}

type Chord = 'C' | 'F' | 'G';

/** Bars that fill a bar of each meter. Every one passes `checkBar` (tunes.test.ts). */
const FULL: Readonly<Record<string, readonly string[]>> = {
  '4/4': ['4 4 4 4', '2 4 4', '4 4 2', '8 8 4 4 4', '4 8 8 2', '4 4 8 8 4', '2. 4'],
  '3/4': ['4 4 4', '2 4', '4 2', '8 8 4 4', '4 8 8 4', '4 4 8 8'],
  '6/8': ['8 8 8 8 8 8', '4 8 4 8', '4. 4.', '4. 8 8 8', '8 8 8 4.', '4 8 4.'],
};

/** Last bars: a long note to end on. */
const ENDS: Readonly<Record<string, readonly string[]>> = {
  '4/4': ['1', '2 2', '4 4 2'],
  '3/4': ['2.', '4 2'],
  '6/8': ['4. 4.', '4 8 4.'],
};

/** Pickups by `<meter>:<beats>`, in the bottom number's note. */
const PICKUPS: Readonly<Record<string, readonly string[]>> = {
  '4/4:1': ['4', '8 8'],
  '4/4:2': ['4 4', '8 8 4', '2'],
  '4/4:3': ['4 4 4', '2 4', '8 8 4 4'],
  '3/4:1': ['4', '8 8'],
  '3/4:2': ['4 4', '8 8 4'],
  '6/8:1': ['8'],
  '6/8:3': ['8 8 8', '4 8', '4.'],
};

/** The last bar of a pickup tune: what the pickup leaves of a bar. */
const PICKUP_ENDS: Readonly<Record<string, readonly string[]>> = {
  '4/4:1': ['2.', '4 2'],
  '4/4:2': ['2', '4 4'],
  '4/4:3': ['4'],
  '3/4:1': ['2', '4 4'],
  '3/4:2': ['4'],
  '6/8:1': ['4. 4', '4 8 4'],
  '6/8:3': ['4.'],
};

/** The meters a road map is written in, by turns (rule 12). */
export const ROAD_MAP_METERS: readonly string[] = ['4/4', '3/4'];

const TONES: Readonly<Record<Chord, readonly string[]>> = {
  C: ['C4', 'E4', 'G4', 'C5'],
  F: ['F4', 'A4', 'C5'],
  G: ['D4', 'G4', 'B4', 'D5'],
};
const BASS: Readonly<Record<Chord, string>> = { C: 'C3', F: 'F2', G: 'G2' };
/** The chords of a road map's bars, by turns from the first; the last bar is always C. */
const CYCLE: readonly Chord[] = ['C', 'F', 'G', 'C'];

function pick<T>(list: readonly T[], rng: () => number): T {
  const item = list[Math.floor(rng() * list.length)] ?? list[0];
  if (item === undefined) throw new RangeError('Nothing to pick from');
  return item;
}

function rowOf(table: Readonly<Record<string, readonly string[]>>, key: string): readonly string[] {
  const row = table[key];
  if (!row) throw new RangeError(`No bars for ${key}`);
  return row;
}

/** A bar of the melody: chord tones, ending on `last` when given. */
function bar(
  rhythm: string,
  chord: Chord,
  rng: () => number,
  opts: { bass: boolean; last?: string },
): TuneBar {
  const count = parseRhythm(rhythm).length;
  const pitches = Array.from({ length: count }, () => pick(TONES[chord], rng));
  if (opts.last) pitches[count - 1] = opts.last;
  return { rhythm, pitches, bass: opts.bass ? BASS[chord] : null };
}

/**
 * A road map's tune: a bar per mark. The bar before a turn back (a 1st
 * ending's last bar, or any end repeat) ends on G, the dominant, so the
 * repeat pulls back to C; the tune ends on C.
 */
export function roadMapTune(
  marks: readonly FormMarks[],
  meter: string,
  rng: () => number,
): TuneBar[] {
  const last = marks.length - 1;
  return marks.map((m, i) => {
    const turns = Boolean(m.repeatEnd) && i < last;
    if (i === last) return bar(pick(rowOf(ENDS, meter), rng), 'C', rng, { bass: true, last: 'C4' });
    if (turns) return bar(pick(rowOf(ENDS, meter), rng), 'G', rng, { bass: true, last: 'G4' });
    return bar(pick(rowOf(FULL, meter), rng), CYCLE[i % CYCLE.length] as Chord, rng, {
      bass: true,
    });
  });
}

/** The written bars of a pickup tune: the pickup, three full bars and a short last bar. */
export const PICKUP_TUNE_BARS = 5;

/**
 * A pickup tune: the pickup on G (no bass, leading in), bars 1 to 3, and a
 * last bar that holds what the pickup took, ending on C.
 */
export function pickupTune(meter: string, beats: number, rng: () => number): TuneBar[] {
  const key = `${meter}:${beats}`;
  const full = rowOf(FULL, meter);
  return [
    bar(pick(rowOf(PICKUPS, key), rng), 'G', rng, { bass: false, last: 'G4' }),
    bar(pick(full, rng), 'C', rng, { bass: true }),
    bar(pick(full, rng), 'F', rng, { bass: true }),
    bar(pick(full, rng), 'G', rng, { bass: true }),
    bar(pick(rowOf(PICKUP_ENDS, key), rng), 'C', rng, { bass: true, last: 'C4' }),
  ];
}

/** Every rhythm table, for the tests. */
export const RHYTHMS = { FULL, ENDS, PICKUPS, PICKUP_ENDS } as const;
