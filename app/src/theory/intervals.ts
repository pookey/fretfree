import {
  MAX_FRET,
  STANDARD_TUNING,
  allStrings,
  crossesGBShift,
  midiAt,
  openStringMidi,
  positionsOfPitchClass,
  midiToFretNote,
  type Position,
  type SearchOptions,
  type Tuning,
} from './fretboard';

/**
 * Intervals and octaves as fretboard shapes (topics C1, C3). Everything is
 * computed from pitch, so the G–B shift (+1 fret when a shape crosses the
 * major-3rd pair in standard tuning) falls out of the arithmetic rather than
 * being special-cased; `gbShift` flags where it applies so drills and worked
 * examples can teach it explicitly.
 */

export type IntervalName =
  'P1' | 'm2' | 'M2' | 'm3' | 'M3' | 'P4' | 'TT' | 'P5' | 'm6' | 'M6' | 'm7' | 'M7' | 'P8';

export interface IntervalInfo {
  readonly name: IntervalName;
  readonly semitones: number;
  /** Scale-degree label relative to a root, e.g. `b7`. */
  readonly degree: string;
  /** Generic interval number (1 = unison … 8 = octave); TT counts as a 4th/5th, i.e. 4. */
  readonly number: number;
  readonly long: string;
}

/** P1–P8 by semitone count (index = semitones). */
export const INTERVALS: readonly IntervalInfo[] = [
  { name: 'P1', semitones: 0, degree: '1', number: 1, long: 'perfect unison' },
  { name: 'm2', semitones: 1, degree: 'b2', number: 2, long: 'minor 2nd' },
  { name: 'M2', semitones: 2, degree: '2', number: 2, long: 'major 2nd' },
  { name: 'm3', semitones: 3, degree: 'b3', number: 3, long: 'minor 3rd' },
  { name: 'M3', semitones: 4, degree: '3', number: 3, long: 'major 3rd' },
  { name: 'P4', semitones: 5, degree: '4', number: 4, long: 'perfect 4th' },
  { name: 'TT', semitones: 6, degree: 'b5', number: 4, long: 'tritone' },
  { name: 'P5', semitones: 7, degree: '5', number: 5, long: 'perfect 5th' },
  { name: 'm6', semitones: 8, degree: 'b6', number: 6, long: 'minor 6th' },
  { name: 'M6', semitones: 9, degree: '6', number: 6, long: 'major 6th' },
  { name: 'm7', semitones: 10, degree: 'b7', number: 7, long: 'minor 7th' },
  { name: 'M7', semitones: 11, degree: '7', number: 7, long: 'major 7th' },
  { name: 'P8', semitones: 12, degree: '8', number: 8, long: 'perfect octave' },
];

/** The intervals taught as shapes (C3): m2 to P8. */
export const SHAPE_INTERVALS: readonly IntervalName[] = INTERVALS.slice(1).map((i) => i.name);

export function isIntervalName(value: string): value is IntervalName {
  return INTERVALS.some((i) => i.name === value);
}

export function intervalInfo(name: IntervalName): IntervalInfo {
  const info = INTERVALS.find((i) => i.name === name);
  if (!info) throw new Error(`Unknown interval: ${String(name)}`);
  return info;
}

export function intervalSemitones(name: IntervalName): number {
  return intervalInfo(name).semitones;
}

/**
 * Octave-reduce a semitone distance to a simple interval: 0 is P1, any
 * non-zero multiple of 12 is P8, otherwise |semitones| mod 12.
 */
export function intervalFromSemitones(semitones: number): IntervalName {
  if (!Number.isInteger(semitones)) throw new RangeError(`Not a whole semitone: ${semitones}`);
  const abs = Math.abs(semitones);
  const reduced = abs === 0 ? 0 : abs % 12 === 0 ? 12 : abs % 12;
  return (INTERVALS[reduced] as IntervalInfo).name;
}

/** Signed pitch distance from `a` to `b` in semitones (positive when `b` is higher). */
export function semitonesBetween(
  a: Position,
  b: Position,
  tuning: Tuning = STANDARD_TUNING,
): number {
  return midiAt(b, tuning) - midiAt(a, tuning);
}

/**
 * The interval between two dots, measured from the lower pitch to the higher
 * (order-independent) and octave-reduced, as a player names it: "name the
 * interval between two dots" (D5).
 */
export function intervalBetween(
  a: Position,
  b: Position,
  tuning: Tuning = STANDARD_TUNING,
): IntervalName {
  return intervalFromSemitones(semitonesBetween(a, b, tuning));
}

/**
 * The interval of `pos` as a degree above `root`, regardless of octave or
 * which is higher: G below a C root is still the P5 of C. Unisons are P1 and
 * other same-pitch-class positions P8.
 */
export function intervalFromRoot(
  root: Position,
  pos: Position,
  tuning: Tuning = STANDARD_TUNING,
): IntervalName {
  const diff = semitonesBetween(root, pos, tuning);
  if (diff === 0) return 'P1';
  const up = ((diff % 12) + 12) % 12;
  return up === 0 ? 'P8' : (INTERVALS[up] as IntervalInfo).name;
}

export type IntervalDirection = 'up' | 'down';

/**
 * The position on `string` sounding exactly `interval` above (or below) the
 * root, or null if it falls off the neck. The G–B shift is handled because the
 * fret comes from pitch: a M3 from s4f5 (G) lands on s3f4, but from s3f5 (C)
 * it lands on s2f5, one fret higher than the fourths-tuning shape.
 */
export function positionForInterval(
  root: Position,
  interval: IntervalName,
  string: number,
  opts: { tuning?: Tuning; direction?: IntervalDirection } = {},
): Position | null {
  const tuning = opts.tuning ?? STANDARD_TUNING;
  const sign = opts.direction === 'down' ? -1 : 1;
  const target = midiAt(root, tuning) + sign * intervalSemitones(interval);
  const fret = target - openStringMidi(string, tuning);
  if (fret < 0 || fret > MAX_FRET) return null;
  return { string, fret };
}

/**
 * Every position in the search window that is `interval` above the root as a
 * degree (any octave, either side of the root), for "tap the b7" drills (D6)
 * that accept any correct position. P1 and P8 both mean the root's pitch
 * class; the root itself is excluded.
 */
export function positionsForInterval(
  root: Position,
  interval: IntervalName,
  opts: SearchOptions = {},
): Position[] {
  const tuning = opts.tuning ?? STANDARD_TUNING;
  const chroma = (midiAt(root, tuning) + intervalSemitones(interval)) % 12;
  return positionsOfPitchClass(midiToFretNote(chroma).pc, opts).filter(
    (p) => !(p.string === root.string && p.fret === root.fret),
  );
}

export interface IntervalShape {
  readonly interval: IntervalName;
  /** String of the root (the lower note). */
  readonly fromString: number;
  /** String of the upper note. */
  readonly toString: number;
  /** Upper-note fret minus root fret. */
  readonly fretOffset: number;
  /**
   * True when the shape crosses the G–B pair, so it is one fret off the
   * all-fourths shape (higher going up the strings, lower coming down).
   */
  readonly gbShift: boolean;
}

/**
 * The movable shape of an ascending interval from a root on `fromString` to
 * the upper note on `toString` (same string allowed). Shapes are fret offsets,
 * so they hold anywhere the neck has room.
 */
export function intervalShape(
  interval: IntervalName,
  fromString: number,
  toString: number,
  tuning: Tuning = STANDARD_TUNING,
): IntervalShape {
  const open = openStringMidi(toString, tuning) - openStringMidi(fromString, tuning);
  return {
    interval,
    fromString,
    toString,
    fretOffset: intervalSemitones(interval) - open,
    gbShift: crossesGBShift(fromString, toString, tuning),
  };
}

/**
 * Every m2–P8 shape for every ordered string pair (including same-string
 * shapes), root string lowest-pitched first. Filter by `fretOffset` for
 * playable stretches; shapes to a lower-pitched string have large offsets.
 */
export function intervalShapes(
  opts: { tuning?: Tuning; intervals?: readonly IntervalName[] } = {},
): IntervalShape[] {
  const tuning = opts.tuning ?? STANDARD_TUNING;
  const intervals = opts.intervals ?? SHAPE_INTERVALS;
  const strings = allStrings(tuning).reverse();
  const out: IntervalShape[] = [];
  for (const from of strings) {
    for (const to of strings) {
      for (const interval of intervals) out.push(intervalShape(interval, from, to, tuning));
    }
  }
  return out;
}

/**
 * The octave of `pos` on another string, nearest in fret to `pos` (C1 items
 * such as `octave:s6f5→s4`). Any non-zero number of octaves counts; on a tie
 * the higher octave wins. Null if no octave fits on that string.
 */
export function octaveOnString(
  pos: Position,
  string: number,
  tuning: Tuning = STANDARD_TUNING,
): Position | null {
  const midi = midiAt(pos, tuning);
  const open = openStringMidi(string, tuning);
  let best: Position | null = null;
  for (let fret = 0; fret <= MAX_FRET; fret++) {
    const diff = open + fret - midi;
    if (diff === 0 || diff % 12 !== 0) continue;
    // Frets ascend, so `<=` lets the higher octave win a tie.
    if (best === null || Math.abs(fret - pos.fret) <= Math.abs(best.fret - pos.fret)) {
      best = { string, fret };
    }
  }
  return best;
}
