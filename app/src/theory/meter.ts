/**
 * Meter theory (topics T1, T2 and T7, design §12), pure.
 *
 * Conventions:
 * - Durations are exact fractions of a whole note (`Frac`): a quarter is 1/4,
 *   a dotted quarter 3/8, a triplet eighth 1/12. Floats would drift under
 *   tuplets and bar-fill checks need exact equality.
 * - A **pulse** is the note the bottom number names, the unit the tempo is
 *   counted in, as in the timing engine (`timing/meter.ts`): quarters in 4/4,
 *   eighths in 6/8 and 7/8.
 * - `groups` split a bar's pulses: `[1, 1, 1, 1]` for 4/4, `[3, 3]` for 6/8,
 *   `[2, 2, 3]` for 7/8 counted 2+2+3, `[3, 2]` for 5/4 counted 3+2.
 * - **Felt beats** are what a listener taps: one per pulse in simple time
 *   (4/4 = 4, 2/2 = 2), one per dotted group in compound time (6/8 = 2,
 *   12/8 = 4), and in odd meters one per group when the pulse is an eighth or
 *   shorter (7/8 = 3 uneven beats) but one per pulse when it is a quarter or
 *   longer (5/4 = 5 beats, accented 3+2).
 */

// ---------------------------------------------------------------------------
// Exact fractions

/** A fraction in lowest terms with a positive denominator. */
export interface Frac {
  readonly n: number;
  readonly d: number;
}

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) [x, y] = [y, x % y];
  return x;
}

export function frac(n: number, d = 1): Frac {
  if (!Number.isInteger(n) || !Number.isInteger(d) || d === 0)
    throw new RangeError(`Invalid fraction: ${n}/${d}`);
  const g = gcd(n, d) || 1;
  const sign = d < 0 ? -1 : 1;
  return { n: (sign * n) / g || 0, d: (sign * d) / g };
}

export const ZERO: Frac = frac(0);

export function fracAdd(a: Frac, b: Frac): Frac {
  return frac(a.n * b.d + b.n * a.d, a.d * b.d);
}

export function fracSub(a: Frac, b: Frac): Frac {
  return frac(a.n * b.d - b.n * a.d, a.d * b.d);
}

export function fracMul(a: Frac, b: Frac): Frac {
  return frac(a.n * b.n, a.d * b.d);
}

export function fracDiv(a: Frac, b: Frac): Frac {
  if (b.n === 0) throw new RangeError('Division by zero');
  return frac(a.n * b.d, a.d * b.n);
}

/** Negative, zero or positive as `a` is less than, equal to or more than `b`. */
export function fracCmp(a: Frac, b: Frac): number {
  return a.n * b.d - b.n * a.d;
}

export function fracEq(a: Frac, b: Frac): boolean {
  return a.n === b.n && a.d === b.d;
}

export function fracSum(parts: readonly Frac[]): Frac {
  return parts.reduce(fracAdd, ZERO);
}

export function fracToNumber(f: Frac): number {
  return f.n / f.d;
}

/** "3/8", "1", "-1/4". */
export function fracToString(f: Frac): string {
  return f.d === 1 ? String(f.n) : `${f.n}/${f.d}`;
}

/** True when the denominator is a power of two: a length the plain note values can spell. */
export function isDyadic(f: Frac): boolean {
  return (f.d & (f.d - 1)) === 0;
}

// ---------------------------------------------------------------------------
// Note values

/** A note value by its denominator: 1 = whole, 4 = quarter, 16 = sixteenth. */
export type NoteValue = 1 | 2 | 4 | 8 | 16 | 32 | 64;

export const NOTE_VALUES: readonly NoteValue[] = [1, 2, 4, 8, 16, 32, 64];

export function isNoteValue(v: number): v is NoteValue {
  return (NOTE_VALUES as readonly number[]).includes(v);
}

/** A note value with its dots, the unit a beat is felt in. */
export interface Duration {
  readonly value: NoteValue;
  readonly dots: 0 | 1 | 2;
}

/** The length of a value with dots: a dot adds half, a second dot a quarter. */
export function noteLength(value: NoteValue, dots: 0 | 1 | 2 = 0): Frac {
  // value × (2 − 1/2^dots) = (2^(dots+1) − 1) / (value × 2^dots)
  return frac(2 ** (dots + 1) - 1, value * 2 ** dots);
}

export function durationLength(d: Duration): Frac {
  return noteLength(d.value, d.dots);
}

const VALUE_NAMES: Record<NoteValue, string> = {
  1: 'whole',
  2: 'half',
  4: 'quarter',
  8: 'eighth',
  16: 'sixteenth',
  32: 'thirty-second',
  64: 'sixty-fourth',
};

/** "dotted quarter", "eighth". */
export function durationName(d: Duration): string {
  return `${['', 'dotted ', 'double-dotted '][d.dots]}${VALUE_NAMES[d.value]}`;
}

// ---------------------------------------------------------------------------
// Time signatures

/** The bottom numbers a time signature may have. */
export type MeterUnit = 2 | 4 | 8 | 16;

export type MeterKind = 'simple' | 'compound' | 'odd';

export interface TimeSignature {
  /** Pulses per bar (the top number). */
  readonly top: number;
  /** The pulse's note value (the bottom number). */
  readonly bottom: MeterUnit;
  /** Pulses per group, in order; they sum to `top`. */
  readonly groups: readonly number[];
  /** Written as a symbol: common time (C, 4/4) or cut time (¢, 2/2). */
  readonly symbol?: 'common' | 'cut';
}

function isMeterUnit(v: number): v is MeterUnit {
  return v === 2 || v === 4 || v === 8 || v === 16;
}

function isCompoundTop(top: number): boolean {
  return top > 3 && top % 3 === 0;
}

/** The usual grouping of a bar of `top` pulses. */
export function defaultGroups(top: number): number[] {
  if (top <= 4) return Array<number>(top).fill(1);
  if (isCompoundTop(top)) return Array<number>(top / 3).fill(3);
  if (top === 5) return [3, 2];
  if (top === 7) return [2, 2, 3];
  // 8 = 3+3+2, 10 = 3+3+2+2, 11 = 3+3+3+2: threes first, then twos.
  const twos = top % 3 === 1 ? 2 : 1;
  return [...Array<number>((top - twos * 2) / 3).fill(3), ...Array<number>(twos).fill(2)];
}

/**
 * A time signature. `groups` is needed only for a grouping other than the
 * usual one (`7/8` is 2+2+3 unless told 3+2+2). Equal groups must be ones
 * (simple, at most four beats) or threes (compound): 4/8 grouped 2+2 is 2/4,
 * and 6/8 grouped in ones is 3/4 or 6/4.
 */
export function timeSignature(
  top: number,
  bottom: number,
  groups?: readonly number[],
  symbol?: 'common' | 'cut',
): TimeSignature {
  if (!Number.isInteger(top) || top < 1 || top > 32)
    throw new RangeError(`Invalid time signature top: ${top}`);
  if (!isMeterUnit(bottom)) throw new RangeError(`Invalid time signature bottom: ${bottom}`);
  const g = groups ? [...groups] : defaultGroups(top);
  if (g.length === 0 || g.some((n) => !Number.isInteger(n) || n < 1))
    throw new RangeError('Groups must be whole numbers of pulses');
  if (g.reduce((s, n) => s + n, 0) !== top)
    throw new RangeError(`Groups ${g.join('+')} don't add up to ${top}`);
  const even = g.every((n) => n === g[0]);
  if (even && !(g[0] === 1 ? top <= 4 : g[0] === 3 && g.length > 1))
    throw new RangeError(`${top}/${bottom} can't be grouped ${g.join('+')}`);
  if (symbol === 'common' && !(top === 4 && bottom === 4)) throw new RangeError('C is 4/4');
  if (symbol === 'cut' && !(top === 2 && bottom === 2)) throw new RangeError('¢ is 2/2');
  return symbol ? { top, bottom, groups: g, symbol } : { top, bottom, groups: g };
}

export const COMMON_TIME = timeSignature(4, 4, undefined, 'common');
export const CUT_TIME = timeSignature(2, 2, undefined, 'cut');

const TS_TEXT = /^(?:(\d+)|(\d+(?:\+\d+)+))\/(\d+)(?:\s*\((\d+(?:\+\d+)+)\))?$/;

/**
 * Reads "4/4", "6/8", "7/8 (3+2+2)", "3+2+2/8", "C" (common time) and "¢"
 * (cut time; "cut" and "common" also work).
 */
export function parseTimeSignature(text: string): TimeSignature {
  const t = text.trim();
  if (t === 'C' || t === 'common') return COMMON_TIME;
  if (t === '¢' || t === 'cut') return CUT_TIME;
  const m = TS_TEXT.exec(t);
  if (!m) throw new RangeError(`Invalid time signature: ${text}`);
  const [, plain, additive, bottom, grouping] = m;
  if (additive && grouping) throw new RangeError(`Grouping given twice: ${text}`);
  const groups = (additive ?? grouping)?.split('+').map(Number);
  const top = plain ? Number(plain) : groups!.reduce((s, n) => s + n, 0);
  return timeSignature(top, Number(bottom), groups);
}

export function meterKind(ts: TimeSignature): MeterKind {
  const first = ts.groups[0];
  if (ts.groups.every((n) => n === first)) return first === 1 ? 'simple' : 'compound';
  return 'odd';
}

/**
 * "6/8", "2/2", and for odd meters the grouping too: "7/8 (2+2+3)", as the
 * timing engine's `METER_PRESETS` are keyed.
 */
export function timeSignatureName(ts: TimeSignature): string {
  const base = `${ts.top}/${ts.bottom}`;
  return meterKind(ts) === 'odd' ? `${base} (${ts.groups.join('+')})` : base;
}

export function isCutTime(ts: TimeSignature): boolean {
  return ts.top === 2 && ts.bottom === 2;
}

/** A bar's length: 3/4 is three quarters, 6/8 three quarters too. */
export function barLength(ts: TimeSignature): Frac {
  return frac(ts.top, ts.bottom);
}

export function pulseLength(ts: TimeSignature): Frac {
  return frac(1, ts.bottom);
}

/** True when the felt beats are the groups, false when they are the pulses. */
function beatsAreGroups(ts: TimeSignature): boolean {
  const kind = meterKind(ts);
  return kind === 'compound' || (kind === 'odd' && ts.bottom >= 8);
}

/** One felt beat: where it starts, how long it is, and how many pulses it holds. */
export interface Beat {
  readonly start: Frac;
  readonly length: Frac;
  readonly pulses: number;
}

/** The felt beats of a bar, in order. */
export function beats(ts: TimeSignature): Beat[] {
  const sizes = beatsAreGroups(ts) ? ts.groups : Array<number>(ts.top).fill(1);
  const out: Beat[] = [];
  let start = ZERO;
  for (const pulses of sizes) {
    const length = frac(pulses, ts.bottom);
    out.push({ start, length, pulses });
    start = fracAdd(start, length);
  }
  return out;
}

/** How many beats a listener taps per bar: 6/8 → 2, 2/2 → 2, 7/8 → 3, 5/4 → 5. */
export function feltBeats(ts: TimeSignature): number {
  return beatsAreGroups(ts) ? ts.groups.length : ts.top;
}

/**
 * The note value one felt beat lasts: a quarter in 4/4, a dotted quarter in
 * 6/8, a half in cut time. `null` when the beats are uneven (7/8 = 2+2+3).
 */
export function beatUnit(ts: TimeSignature): Duration | null {
  if (!beatsAreGroups(ts)) return { value: ts.bottom, dots: 0 };
  if (meterKind(ts) === 'compound') return { value: (ts.bottom / 2) as NoteValue, dots: 1 };
  return null;
}

/** "duple", "triple", "quadruple", or the count for larger meters. */
function beatCountName(n: number): string {
  return ({ 2: 'duple', 3: 'triple', 4: 'quadruple' } as Record<number, string>)[n] ?? `${n}-beat`;
}

/**
 * A one-line description for explanations and feedback:
 * "Compound duple: 2 dotted-quarter beats, each split in 3",
 * "Odd meter: 3 uneven beats, grouped 2+2+3".
 */
export function describeMeter(ts: TimeSignature): string {
  const kind = meterKind(ts);
  const n = feltBeats(ts);
  const unit = beatUnit(ts);
  if (kind === 'odd') {
    const each = unit ? `${durationName(unit)} beats` : 'uneven beats';
    return `Odd meter: ${n} ${each}, grouped ${ts.groups.join('+')}`;
  }
  const split = kind === 'simple' ? 2 : 3;
  const name = durationName(unit!).replace(' ', '-');
  return `${kind === 'simple' ? 'Simple' : 'Compound'} ${beatCountName(n)}: ${n} ${name} beats, each split in ${split}`;
}

// ---------------------------------------------------------------------------
// Beaming and the click

/**
 * The spans eighths and shorter beam within, covering the bar in order. Beams
 * show the beat: one span per beat (per dotted beat in compound time, per
 * group in odd eighth meters). Where the beat is itself an eighth, eighths
 * beam in pairs, and 3/8 beams as one bar.
 */
export function beamSpans(ts: TimeSignature): Frac[] {
  const kind = meterKind(ts);
  if (kind !== 'simple' || ts.bottom <= 4) return beats(ts).map((b) => b.length);
  if (ts.top === 3) return [barLength(ts)];
  const spans: Frac[] = [];
  for (let left = ts.top; left > 0; left -= 2) spans.push(frac(Math.min(2, left), ts.bottom));
  return spans;
}

/** The beam spans as VexFlow `Beam.generateBeams` groups: 7/8 (2+2+3) → ["2/8", "2/8", "3/8"]. */
export function vexflowBeamGroups(ts: TimeSignature): string[] {
  return beamSpans(ts).map((s) => `${(s.n * ts.bottom) / s.d}/${ts.bottom}`);
}

/**
 * The timing engine's click meter (`ClickMeter` in `timing/meter.ts`, the
 * same shape): a simple meter is one group, so only its downbeat is accented;
 * compound and odd meters accent each group.
 */
export function clickMeter(ts: TimeSignature): { groups: number[]; unit: MeterUnit } {
  return {
    groups: meterKind(ts) === 'simple' ? [ts.top] : [...ts.groups],
    unit: ts.bottom,
  };
}
