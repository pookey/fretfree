import {
  ZERO,
  beamSpans,
  barLength,
  beats,
  frac,
  fracAdd,
  fracCmp,
  fracDiv,
  fracEq,
  fracMul,
  fracSub,
  fracSum,
  fracToNumber,
  isDyadic,
  isNoteValue,
  noteLength,
  pulseLength,
  type Frac,
  type NoteValue,
  type TimeSignature,
} from './meter';

/**
 * Rhythm theory (topic R4, the T tracks' bars, design §12), pure.
 *
 * A rhythm is a list of events, each a note or rest with its value, dots,
 * tie and tuplet. Lengths are exact fractions of a whole note (`Frac`, see
 * `meter.ts`). The compact text form (`parseRhythm`) is what the cell
 * catalogue and tests are written in:
 *
 * ```
 * 4      quarter          8.   dotted eighth      r8   eighth rest
 * 4~     quarter tied into the next note
 * 3[8 8 8]               a triplet: three eighths in the time of two
 * 2:3[8 8]               a duplet: two eighths in the time of three
 * ```
 *
 * Onsets feed the timing engine (M8-01): `onsetPulses(rhythm, pulseLength(ts))`
 * gives each attack in pulses from the bar's start, so a bar starting at pulse
 * `p0` has targets `onsetPulses(…).map((p) => metronome.timeAtPulse(p0 + p))`,
 * which stays right through tempo changes. `onsetTimesMs` does the same at a
 * steady tempo.
 */

// ---------------------------------------------------------------------------
// Events

/** `num` notes in the time of `inSpaceOf`: a triplet is 3 in 2. */
export interface Tuplet {
  readonly num: number;
  readonly inSpaceOf: number;
}

export interface RhythmEvent {
  readonly value: NoteValue;
  readonly dots?: 0 | 1 | 2;
  readonly rest?: boolean;
  /** Tied into the next event, which then isn't attacked again. */
  readonly tie?: boolean;
  readonly tuplet?: Tuplet;
}

export type Rhythm = readonly RhythmEvent[];

export const TRIPLET: Tuplet = { num: 3, inSpaceOf: 2 };

/** The length of one event, tuplet included: a triplet eighth is 1/12. */
export function eventLength(e: RhythmEvent): Frac {
  const plain = noteLength(e.value, e.dots ?? 0);
  return e.tuplet ? fracMul(plain, frac(e.tuplet.inSpaceOf, e.tuplet.num)) : plain;
}

export function rhythmLength(r: Rhythm): Frac {
  return fracSum(r.map(eventLength));
}

/** Where each event starts, from the start of the rhythm. */
export function eventStarts(r: Rhythm): Frac[] {
  const out: Frac[] = [];
  let at = ZERO;
  for (const e of r) {
    out.push(at);
    at = fracAdd(at, eventLength(e));
  }
  return out;
}

function sameTuplet(a: Tuplet | undefined, b: Tuplet | undefined): boolean {
  return a === b || (!!a && !!b && a.num === b.num && a.inSpaceOf === b.inSpaceOf);
}

/** Runs of consecutive events sharing a tuplet: `[from, to)` index pairs. */
function tupletRuns(r: Rhythm): [number, number][] {
  const runs: [number, number][] = [];
  r.forEach((e, i) => {
    if (!e.tuplet) return;
    const last = runs.at(-1);
    if (last && last[1] === i && sameTuplet(r[i - 1]!.tuplet, e.tuplet)) last[1] = i + 1;
    else runs.push([i, i + 1]);
  });
  return runs;
}

// ---------------------------------------------------------------------------
// Text form

/**
 * The largest power of two below `num`: a triplet is in 2, a quintuplet in 4.
 * 0 for a power of two (a duplet or quadruplet), which must say what it is in.
 */
function defaultInSpaceOf(num: number): number {
  return (num & (num - 1)) === 0 ? 0 : 2 ** Math.floor(Math.log2(num));
}

const TOKEN = /^(r)?(\d+)(\.{0,2})(~)?$/;
const TUPLET_OPEN = /^(\d+)(?::(\d+))?\[(.*)$/;

function parseToken(tok: string, tuplet?: Tuplet): RhythmEvent {
  const m = TOKEN.exec(tok);
  const value = Number(m?.[2]);
  if (!m || !isNoteValue(value)) throw new RangeError(`Invalid rhythm token: ${tok}`);
  const dots = m[3]!.length as 0 | 1 | 2;
  if (m[1] && m[4]) throw new RangeError(`A rest can't be tied: ${tok}`);
  return {
    value,
    ...(dots ? { dots } : {}),
    ...(m[1] ? { rest: true } : {}),
    ...(m[4] ? { tie: true } : {}),
    ...(tuplet ? { tuplet } : {}),
  };
}

/** Reads the text form (see the header): `"8. 16"`, `"r8 8 3[8 8 8] 4~ 4"`. */
export function parseRhythm(text: string): RhythmEvent[] {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  const out: RhythmEvent[] = [];
  let tuplet: Tuplet | undefined;
  for (const raw of tokens) {
    let tok = raw;
    const open = TUPLET_OPEN.exec(tok);
    if (open) {
      if (tuplet) throw new RangeError('Nested tuplets are not supported');
      const num = Number(open[1]);
      const inSpaceOf = open[2] ? Number(open[2]) : defaultInSpaceOf(num);
      if (num < 2 || inSpaceOf < 1 || num === inSpaceOf)
        throw new RangeError(`Invalid tuplet: ${raw}`);
      tuplet = { num, inSpaceOf };
      tok = open[3]!;
      if (!tok) continue;
    }
    const close = tok.endsWith(']');
    if (close) {
      if (!tuplet) throw new RangeError(`Unopened tuplet: ${raw}`);
      tok = tok.slice(0, -1);
    }
    if (tok) out.push(parseToken(tok, tuplet));
    if (close) tuplet = undefined;
  }
  if (tuplet) throw new RangeError(`Unclosed tuplet: ${text}`);
  if (out.length === 0) throw new RangeError('A rhythm needs at least one note or rest');
  return out;
}

function formatEvent(e: RhythmEvent): string {
  return `${e.rest ? 'r' : ''}${e.value}${'.'.repeat(e.dots ?? 0)}${e.tie ? '~' : ''}`;
}

/** The text form of a rhythm; `parseRhythm(formatRhythm(r))` gives `r` back. */
export function formatRhythm(r: Rhythm): string {
  const runs = new Map(tupletRuns(r));
  const parts: string[] = [];
  for (let i = 0; i < r.length; i += 1) {
    const end = runs.get(i);
    const t = r[i]!.tuplet;
    if (end === undefined || !t) {
      parts.push(formatEvent(r[i]!));
      continue;
    }
    const head = t.inSpaceOf === defaultInSpaceOf(t.num) ? `${t.num}` : `${t.num}:${t.inSpaceOf}`;
    parts.push(`${head}[${r.slice(i, end).map(formatEvent).join(' ')}]`);
    i = end - 1;
  }
  return parts.join(' ');
}

const DURATION_CODES = {
  1: 'w',
  2: 'h',
  4: 'q',
  8: '8',
  16: '16',
  32: '32',
  64: '64',
} as const satisfies Record<NoteValue, string>;

/** VexFlow's duration code for a value, as `<Staff>` takes it: 4 → "q". */
export function durationCode<V extends NoteValue>(value: V): (typeof DURATION_CODES)[V] {
  return DURATION_CODES[value];
}

// ---------------------------------------------------------------------------
// Bar fill

export interface BarCheck {
  /** `exact` fills the bar, `short` leaves room, `over` runs past the barline. */
  readonly fill: 'exact' | 'short' | 'over';
  readonly length: Frac;
  readonly bar: Frac;
  /** What is left to fill; negative when over. */
  readonly remaining: Frac;
  /**
   * Events that start off a felt beat and run across the next one, hiding it:
   * in 6/8, the middle quarter of `4 4 4` crosses beat 2 (that is 3/4).
   * Simple time allows the syncopation `8 4 8`, a note of one beat from the
   * half beat, except across the middle of a four-beat bar.
   */
  readonly hiddenBeats: number[];
  /** First index of each tuplet run that doesn't add up to whole plain values. */
  readonly brokenTuplets: number[];
  /** Ties out of a rest or into a rest. */
  readonly badTies: number[];
  /** Exact, with no hidden beats, broken tuplets or bad ties. */
  readonly ok: boolean;
}

/**
 * Checks one bar of `r` against a time signature, for D29 and for bars the
 * drills generate. A note that starts on a beat may last whole beats; one
 * that starts between beats must end by the next (bar the syncopation, see
 * `hiddenBeats`), as notation shows the beat.
 */
export function checkBar(r: Rhythm, ts: TimeSignature): BarCheck {
  const length = rhythmLength(r);
  const bar = barLength(ts);
  const remaining = fracSub(bar, length);
  const cmp = fracCmp(length, bar);
  const fill = cmp === 0 ? 'exact' : cmp < 0 ? 'short' : 'over';

  const bs = beats(ts);
  const beatStarts = bs.map((b) => b.start);
  const pulseBeats = bs.every((b) => b.pulses === 1);
  const middle = pulseBeats && ts.top === 4 ? frac(2, ts.bottom) : undefined;
  const starts = eventStarts(r);
  const hiddenBeats: number[] = [];
  r.forEach((e, i) => {
    const start = starts[i]!;
    const len = eventLength(e);
    const end = fracAdd(start, len);
    if (beatStarts.some((b) => fracEq(b, start))) return;
    const crossed = beatStarts.filter((b) => fracCmp(b, start) > 0 && fracCmp(b, end) < 0);
    if (crossed.length === 0) return;
    const syncopation =
      pulseBeats &&
      fracCmp(len, pulseLength(ts)) <= 0 &&
      !crossed.some((b) => middle && fracEq(b, middle));
    if (!syncopation) hiddenBeats.push(i);
  });

  const brokenTuplets = tupletRuns(r)
    .filter(([from, to]) => !isDyadic(rhythmLength(r.slice(from, to))))
    .map(([from]) => from);

  const badTies: number[] = [];
  r.forEach((e, i) => {
    if (e.tie && (e.rest || r[i + 1]?.rest)) badTies.push(i);
  });

  return {
    fill,
    length,
    bar,
    remaining,
    hiddenBeats,
    brokenTuplets,
    badTies,
    ok: fill === 'exact' && !hiddenBeats.length && !brokenTuplets.length && !badTies.length,
  };
}

// ---------------------------------------------------------------------------
// Beaming

/**
 * Which events beam together, as index groups of two or more. Eighths and
 * shorter beam within each of the meter's beam spans (`beamSpans`); a rest,
 * a quarter or longer, a change of tuplet, or a note running out of its span
 * breaks the beam.
 */
export function beamGroups(r: Rhythm, ts: TimeSignature): number[][] {
  const edges: Frac[] = [];
  let at = ZERO;
  for (const s of beamSpans(ts)) {
    at = fracAdd(at, s);
    edges.push(at);
  }
  const spanOf = (pos: Frac) => edges.findIndex((e) => fracCmp(pos, e) < 0);

  const groups: number[][] = [];
  let current: number[] = [];
  let currentSpan = -1;
  const flush = () => {
    if (current.length >= 2) groups.push(current);
    current = [];
  };
  const starts = eventStarts(r);
  r.forEach((e, i) => {
    const start = starts[i]!;
    const end = fracAdd(start, eventLength(e));
    const span = spanOf(start);
    const fits = span >= 0 && fracCmp(end, edges[span]!) <= 0;
    if (e.rest || e.value < 8 || !fits) {
      flush();
      return;
    }
    const prev = r[current.at(-1) ?? -1];
    if (span !== currentSpan || (prev && !sameTuplet(prev.tuplet, e.tuplet))) flush();
    current.push(i);
    currentSpan = span;
  });
  flush();
  return groups;
}

// ---------------------------------------------------------------------------
// Onsets

/** An attack: the event that starts it, when, and how long it sounds (through its ties). */
export interface Onset {
  readonly index: number;
  readonly at: Frac;
  readonly length: Frac;
}

/**
 * The attacks of a rhythm, in order. Rests have none, and a note tied from
 * the one before isn't attacked again: its length joins that note's.
 */
export function onsets(r: Rhythm): Onset[] {
  const starts = eventStarts(r);
  const out: { index: number; at: Frac; length: Frac }[] = [];
  r.forEach((e, i) => {
    if (e.rest) return;
    const len = eventLength(e);
    const prev = r[i - 1];
    const last = out.at(-1);
    if (prev?.tie && !prev.rest && last) last.length = fracAdd(last.length, len);
    else out.push({ index: i, at: starts[i]!, length: len });
  });
  return out;
}

/** Each attack in pulses from the start (a pulse of 1/8 makes a dotted quarter 3). */
export function onsetPulses(r: Rhythm, pulse: Frac): number[] {
  return onsets(r).map((o) => fracToNumber(fracDiv(o.at, pulse)));
}

export interface OnsetTiming {
  /** Pulses per minute, as the metronome counts them. */
  readonly bpm: number;
  /** The pulse's length; a quarter unless given (`pulseLength(ts)` for a meter). */
  readonly pulse?: Frac;
  /** When the rhythm starts. */
  readonly startMs?: number;
}

/** Each attack in ms at a steady tempo: the targets `gradeTiming` aligns onsets to. */
export function onsetTimesMs(
  r: Rhythm,
  { bpm, pulse = frac(1, 4), startMs = 0 }: OnsetTiming,
): number[] {
  if (!Number.isFinite(bpm) || bpm <= 0) throw new RangeError('bpm must be a positive number');
  const ms = 60_000 / bpm;
  return onsetPulses(r, pulse).map((p) => startMs + p * ms);
}

// ---------------------------------------------------------------------------
// Counting

const SIMPLE_COUNT: [Frac, string][] = [
  [frac(1, 4), 'e'],
  [frac(1, 2), '&'],
  [frac(3, 4), 'a'],
  [frac(1, 3), 'trip'],
  [frac(2, 3), 'let'],
];

const COMPOUND_COUNT: [Frac, string][] = [
  [frac(1, 3), 'la'],
  [frac(2, 3), 'li'],
  [frac(1, 6), 'ta'],
  [frac(1, 2), 'ta'],
  [frac(5, 6), 'ta'],
];

/**
 * What each event is counted as: "1 e & a" in simple time, "1 la li" in
 * compound time, with beat numbers for the beats. An event between the
 * counted subdivisions gets "". Odd-meter groups count like a simple beat
 * (two pulses) or a compound one (three).
 */
export function countSyllables(r: Rhythm, ts: TimeSignature): string[] {
  const bs = beats(ts);
  const bar = barLength(ts);
  return eventStarts(r).map((s) => {
    // Later bars count like the first.
    const inBar = fracSub(s, fracMul(frac(Math.floor(fracToNumber(fracDiv(s, bar)))), bar));
    let b = 0;
    while (b + 1 < bs.length && fracCmp(bs[b + 1]!.start, inBar) <= 0) b += 1;
    const beat = bs[b]!;
    const pos = fracDiv(fracSub(inBar, beat.start), beat.length);
    if (pos.n === 0) return String(b + 1);
    const table = beat.pulses === 3 ? COMPOUND_COUNT : SIMPLE_COUNT;
    return table.find(([f]) => fracEq(f, pos))?.[1] ?? '';
  });
}

// ---------------------------------------------------------------------------
// Rhythm cells

/** Cells for beats split in two (`simple`) or in three (`compound`). */
export type CellFeel = 'simple' | 'compound';

export interface RhythmCell {
  /** The item ID suffix: `dotted-8th-16th`. */
  readonly slug: string;
  /** `rhythm:dotted-8th-16th`. */
  readonly id: string;
  readonly name: string;
  readonly feel: CellFeel;
  /** The text form (`parseRhythm`). */
  readonly notation: string;
  readonly rhythm: Rhythm;
  /** Felt beats it lasts: quarters for simple cells, dotted quarters for compound. */
  readonly beats: number;
  /** Teaching order (research/03 R4): 1 quarters and eighths, 2 sixteenths, 3 dotted, 4 tuplets, 5 syncopation. */
  readonly stage: 1 | 2 | 3 | 4 | 5;
  /** The cell it is most easily confused with, to interleave (dotted vs straight, design §12). */
  readonly confusable?: string;
}

type CellSpec = Omit<RhythmCell, 'id' | 'rhythm' | 'slug'>;

const CELL_SPECS: Record<string, CellSpec> = {
  // Simple: one quarter beat unless noted.
  quarter: { name: 'Quarter', feel: 'simple', notation: '4', beats: 1, stage: 1 },
  'quarter-rest': { name: 'Quarter rest', feel: 'simple', notation: 'r4', beats: 1, stage: 1 },
  'two-8ths': {
    name: 'Two eighths',
    feel: 'simple',
    notation: '8 8',
    beats: 1,
    stage: 1,
    confusable: 'dotted-8th-16th',
  },
  half: { name: 'Half', feel: 'simple', notation: '2', beats: 2, stage: 1 },
  'four-16ths': {
    name: 'Four sixteenths',
    feel: 'simple',
    notation: '16 16 16 16',
    beats: 1,
    stage: 2,
  },
  '8th-two-16ths': {
    name: 'Eighth and two sixteenths',
    feel: 'simple',
    notation: '8 16 16',
    beats: 1,
    stage: 2,
    confusable: 'two-16ths-8th',
  },
  'two-16ths-8th': {
    name: 'Two sixteenths and an eighth',
    feel: 'simple',
    notation: '16 16 8',
    beats: 1,
    stage: 2,
    confusable: '8th-two-16ths',
  },
  'dotted-8th-16th': {
    name: 'Dotted eighth and sixteenth',
    feel: 'simple',
    notation: '8. 16',
    beats: 1,
    stage: 3,
    confusable: 'two-8ths',
  },
  '16th-dotted-8th': {
    name: 'Sixteenth and dotted eighth',
    feel: 'simple',
    notation: '16 8.',
    beats: 1,
    stage: 3,
    confusable: 'dotted-8th-16th',
  },
  'dotted-quarter-8th': {
    name: 'Dotted quarter and eighth',
    feel: 'simple',
    notation: '4. 8',
    beats: 2,
    stage: 3,
    confusable: 'two-quarters',
  },
  'two-quarters': { name: 'Two quarters', feel: 'simple', notation: '4 4', beats: 2, stage: 1 },
  '8th-triplet': {
    name: 'Eighth-note triplet',
    feel: 'simple',
    notation: '3[8 8 8]',
    beats: 1,
    stage: 4,
    confusable: 'two-8ths',
  },
  'quarter-triplet': {
    name: 'Quarter-note triplet',
    feel: 'simple',
    notation: '3[4 4 4]',
    beats: 2,
    stage: 4,
    confusable: 'two-quarters',
  },
  'offbeat-8th': {
    name: 'Eighth rest and eighth',
    feel: 'simple',
    notation: 'r8 8',
    beats: 1,
    stage: 5,
    confusable: 'two-8ths',
  },
  '16th-8th-16th': {
    name: 'Sixteenth, eighth, sixteenth',
    feel: 'simple',
    notation: '16 8 16',
    beats: 1,
    stage: 5,
    confusable: 'four-16ths',
  },
  '8th-quarter-8th': {
    name: 'Eighth, quarter, eighth',
    feel: 'simple',
    notation: '8 4 8',
    beats: 2,
    stage: 5,
    confusable: 'two-quarters',
  },
  // Compound: one dotted-quarter beat.
  'dotted-quarter': {
    name: 'Dotted quarter',
    feel: 'compound',
    notation: '4.',
    beats: 1,
    stage: 1,
  },
  'three-8ths': {
    name: 'Three eighths',
    feel: 'compound',
    notation: '8 8 8',
    beats: 1,
    stage: 1,
    confusable: '8th-triplet',
  },
  'quarter-8th': {
    name: 'Quarter and eighth',
    feel: 'compound',
    notation: '4 8',
    beats: 1,
    stage: 1,
    confusable: '8th-quarter',
  },
  '8th-quarter': {
    name: 'Eighth and quarter',
    feel: 'compound',
    notation: '8 4',
    beats: 1,
    stage: 5,
    confusable: 'quarter-8th',
  },
  'six-16ths': {
    name: 'Six sixteenths',
    feel: 'compound',
    notation: '16 16 16 16 16 16',
    beats: 1,
    stage: 2,
  },
  siciliano: {
    name: 'Dotted eighth, sixteenth, eighth',
    feel: 'compound',
    notation: '8. 16 8',
    beats: 1,
    stage: 3,
    confusable: 'three-8ths',
  },
  duplet: {
    name: 'Duplet',
    feel: 'compound',
    notation: '2:3[8 8]',
    beats: 1,
    stage: 4,
    confusable: 'quarter-8th',
  },
};

export function rhythmCellId(slug: string): string {
  return `rhythm:${slug}`;
}

/** The catalogue, in teaching order then catalogue order. */
export const RHYTHM_CELLS: readonly RhythmCell[] = Object.entries(CELL_SPECS)
  .map(([slug, spec]) => ({
    slug,
    id: rhythmCellId(slug),
    rhythm: parseRhythm(spec.notation),
    ...spec,
  }))
  .sort((a, b) => a.stage - b.stage);

const BY_SLUG = new Map(RHYTHM_CELLS.map((c) => [c.slug, c]));

/** A cell by slug or ID: `dotted-8th-16th` or `rhythm:dotted-8th-16th`. */
export function rhythmCell(slugOrId: string): RhythmCell {
  const cell = BY_SLUG.get(slugOrId.replace(/^rhythm:/, ''));
  if (!cell) throw new RangeError(`Unknown rhythm cell: ${slugOrId}`);
  return cell;
}

/** A cell's length: quarters per beat for simple cells, dotted quarters for compound. */
export function cellLength(cell: RhythmCell): Frac {
  return rhythmLength(cell.rhythm);
}

/**
 * The slots a meter offers cells: a simple slot per quarter of a beat made of
 * quarters, a compound slot per dotted-quarter beat. `null` marks a beat no
 * cell fits (3/8's eighth beats, 6/4's dotted halves).
 */
function cellSlots(ts: TimeSignature): (CellFeel | null)[] {
  const quarter = frac(1, 4);
  return beats(ts).flatMap((beat): (CellFeel | null)[] => {
    if (beat.pulses === 3) return [fracEq(beat.length, frac(3, 8)) ? 'compound' : null];
    const quarters = fracDiv(beat.length, quarter);
    return quarters.d === 1 ? Array<CellFeel>(quarters.n).fill('simple') : [null];
  });
}

/**
 * Cells in sequence as one bar. Simple cells take quarter slots and compound
 * cells dotted-quarter beats, so in 7/8 (2+2+3) two simple one-beat cells and
 * then a compound one fill a bar. The cells must fill the bar exactly, and
 * the result must pass `checkBar` (no syncopation across the middle of 4/4).
 */
export function barFromCells(cells: readonly RhythmCell[], ts: TimeSignature): RhythmEvent[] {
  const slots = cellSlots(ts);
  const name = `${ts.top}/${ts.bottom}`;
  let at = 0;
  const out: RhythmEvent[] = [];
  for (const cell of cells) {
    const taken = slots.slice(at, at + cell.beats);
    if (taken.length < cell.beats)
      throw new RangeError(`${cell.slug} runs past the barline of ${name}`);
    if (taken.some((f) => f !== cell.feel))
      throw new RangeError(`${cell.slug} doesn't fit beat ${at + 1} of ${name}`);
    at += cell.beats;
    out.push(...cell.rhythm);
  }
  if (at !== slots.length) throw new RangeError(`The cells leave the bar of ${name} short`);
  if (!checkBar(out, ts).ok) throw new RangeError(`The cells hide a beat of ${name}`);
  return out;
}

/** One cell repeated to fill a bar (`two-8ths` in 4/4 is eight eighths). */
export function cellBar(cell: RhythmCell, ts: TimeSignature): RhythmEvent[] {
  const count = fracDiv(barLength(ts), cellLength(cell));
  if (count.d !== 1)
    throw new RangeError(`${cell.slug} doesn't divide a bar of ${ts.top}/${ts.bottom}`);
  return barFromCells(Array<RhythmCell>(count.n).fill(cell), ts);
}

/** The cells that can fill bars of a meter by repetition. */
export function cellsFor(ts: TimeSignature): RhythmCell[] {
  return RHYTHM_CELLS.filter((c) => {
    try {
      cellBar(c, ts);
      return true;
    } catch {
      return false;
    }
  });
}
