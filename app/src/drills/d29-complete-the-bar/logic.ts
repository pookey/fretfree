import { ENGINE_CONFIG } from '../../engine/config';
import type { Item } from '../../engine/model';
import {
  RHYTHM_CELLS,
  barLength,
  beatUnit,
  clickMeter,
  beats,
  checkBar,
  countSyllables,
  durationName,
  eventLength,
  eventStarts,
  feltBeats,
  formatRhythm,
  fracAdd,
  fracCmp,
  fracDiv,
  fracEq,
  fracToNumber,
  meterKind,
  noteLength,
  onsetPulses,
  parseRhythm,
  parseTimeSignature,
  pulseLength,
  rhythmLength,
  type BarCheck,
  type Frac,
  type NoteValue,
  type RhythmCell,
  type RhythmEvent,
  type TimeSignature,
} from '../../theory';
import type { MetronomeOptions } from '../../timing/metronome';
import type { DrillCheck, DrillContext, DrillSounds } from '../types';
import { D29_METERS, D29_SCOPE, d29Concept as concept, d29Parse as parse } from './meta';

export { D29_ID, D29_METERS, D29_SCOPE, d29CanTest, d29ConceptOf } from './meta';

/**
 * D29 "Complete the bar" (design §6, §12): a time signature and the start of
 * a bar, and the learner drags or taps note values in to fill it. It tests
 * T1's and T2's `meter:6/8:feltBeats` cards by use: a bar of 6/8 is filled
 * one dotted-quarter beat at a time, and `4 4 4` is a bar of 3/4.
 *
 * - **Varied bars** (research/02 rule 12): the given start and one way to
 *   finish it are drawn from the rhythm-cell catalogue (`theory/rhythm.ts`)
 *   per prompt. Any fill that `checkBar` passes is right.
 * - **Scope** (rule 5) widens how much is left to fill (the last two beats,
 *   all but beat 1, then the whole bar) and the palette (four values, then
 *   six). The palette is the same for every meter at a level, so it carries
 *   no clue: the dotted quarter is always there. Nothing is as long as a
 *   bar's two beats (no dotted half, no whole), so a bar is built beat by
 *   beat: one long note would fill 6/8 and 3/4 alike (M8-06 review).
 * - **Wrong fills are explained** from `checkBar`: short or over by how
 *   much, and a note that hides a beat ("6/8 groups in dotted quarters").
 *   A bar that is right in the meter with the same length felt the other
 *   way (3/4 for 6/8, 2/2 for 4/4) is logged as that confusion (rule 6).
 *
 * Words are in `text.ts`, which only the lazy view loads.
 */

export interface D29Prompt {
  itemId: string;
  meter: string;
  /** The bar's given start, in the text form (`parseRhythm`); '' for an empty bar. */
  given: string;
  /** The note values to place, as text-form codes, long to short: `2.`, `4`, `8`. */
  palette: string[];
  /** One way to finish the bar, in the text form: the worked example, and feedback's answer. */
  solution: string;
}

export interface D29Answer {
  /** The values placed after the given start, in order, as palette codes. */
  placed: string[];
}

/** Every value a palette offers, long to short. */
export const FULL_PALETTE: readonly string[] = ['2', '4.', '4', '8.', '8', '16'];
/** Level 0's palette: the half, both quarters and the eighth, for every meter. */
export const SMALL_PALETTE: readonly string[] = ['2', '4.', '4', '8'];

const SIGNATURES = new Map(D29_METERS.map((m) => [m, parseTimeSignature(m)]));

export function signatureOf(meter: string): TimeSignature {
  const ts = SIGNATURES.get(meter);
  if (!ts) throw new RangeError(`D29 doesn't build bars in ${meter}`);
  return ts;
}

function level(scopeLevel: number): number {
  return Math.max(D29_SCOPE.minLevel, Math.min(D29_SCOPE.maxLevel, Math.round(scopeLevel)));
}

export function d29Palette(scopeLevel: number): string[] {
  return [...(level(scopeLevel) === 0 ? SMALL_PALETTE : FULL_PALETTE)];
}

/**
 * Felt beats left to fill: two (all of a two-beat bar, so an empty 6/8 bar
 * can meet its 3/4 misreading from the start), then all but beat 1, then
 * all of it.
 */
export function beatsToFill(meter: string, scopeLevel: number): number {
  const n = feltBeats(signatureOf(meter));
  const two = Math.min(n, 2);
  return [two, Math.max(two, n - 1), n][level(scopeLevel)]!;
}

// --- Building bars ------------------------------------------------------------

/** One event's code as an event: `4.` is a dotted quarter, `r4` a quarter rest. */
export function valueOf(code: string): RhythmEvent {
  const [e, ...more] = parseRhythm(code);
  if (!e || more.length > 0 || e.tie || e.tuplet) throw new RangeError(`Not one value: ${code}`);
  return e;
}

/** A value the learner places: a note, never a rest. */
export function eventOf(code: string): RhythmEvent {
  const e = valueOf(code);
  if (e.rest) throw new RangeError(`Not a note value: ${code}`);
  return e;
}

/** A rhythm in the text form, '' for none. */
export function rhythmOf(text: string): RhythmEvent[] {
  return text.trim() ? parseRhythm(text) : [];
}

/** The bar as the learner left it: the given start, then what they placed. */
export function d29Bar(prompt: D29Prompt, answer: D29Answer): RhythmEvent[] {
  return [...rhythmOf(prompt.given), ...answer.placed.map(eventOf)];
}

/** Cells are laid in quarter slots for simple meters, dotted-quarter slots for compound. */
function slotsPerBeat(ts: TimeSignature): number {
  if (meterKind(ts) === 'compound') return 1;
  return fracToNumber(fracDiv(beats(ts)[0]!.length, { n: 1, d: 4 }));
}

/** Plain cells, before tuplets and syncopation (research/03 R4 stages 1–3). */
function plainCells(ts: TimeSignature): RhythmCell[] {
  const feel = meterKind(ts) === 'compound' ? 'compound' : 'simple';
  return RHYTHM_CELLS.filter((c) => c.feel === feel && c.stage <= 3);
}

/** Cells laid end to end to fill `slots` slots. A one-slot cell always fits. */
function fillSlots(slots: number, cells: readonly RhythmCell[], rng: () => number): RhythmEvent[] {
  const out: RhythmEvent[] = [];
  for (let left = slots; left > 0;) {
    const fits = cells.filter((c) => c.beats <= left);
    const cell = fits[Math.min(fits.length - 1, Math.floor(rng() * fits.length))]!;
    out.push(...cell.rhythm);
    left -= cell.beats;
  }
  return out;
}

/**
 * A given start and one way to finish it. Both are cells laid on the beat,
 * so the bar passes `checkBar`: plain cells hide no beat (the tests sweep
 * every meter and level).
 */
export function buildBar(
  meter: string,
  scopeLevel: number,
  rng: () => number,
): { given: string; solution: string } {
  const ts = signatureOf(meter);
  const per = slotsPerBeat(ts);
  const fill = beatsToFill(meter, scopeLevel);
  const palette = new Set(d29Palette(scopeLevel));
  const cells = plainCells(ts);
  // The fill uses palette values only, so the learner could have built it.
  const fillCells = cells.filter((c) =>
    c.rhythm.every((e) => !e.rest && palette.has(formatRhythm([e]))),
  );
  const given = fillSlots((feltBeats(ts) - fill) * per, cells, rng);
  const solution = fillSlots(fill * per, fillCells, rng);
  return { given: given.length ? formatRhythm(given) : '', solution: formatRhythm(solution) };
}

export function d29MakePrompt(item: Item, ctx: DrillContext): D29Prompt {
  const meter = parse(item);
  if (!meter) throw new Error(`D29 cannot test item ${item.id}`);
  const { given, solution } = buildBar(meter, ctx.scopeLevel, ctx.rng);
  return { itemId: item.id, meter, given, palette: d29Palette(ctx.scopeLevel), solution };
}

// --- Checking -----------------------------------------------------------------

/** The meters a bar of this one could be mistaken for: the same length, felt another way. */
export function partnersOf(meter: string): string[] {
  const bar = barLength(signatureOf(meter));
  return D29_METERS.filter((m) => m !== meter && fracEq(barLength(signatureOf(m)), bar));
}

/** A note that hides a beat, where it starts and the beat it hides. */
export interface HiddenBeat {
  /** Its index among the placed values. */
  placed: number;
  code: string;
  /** The felt beat it starts in, from 1. */
  beat: number;
  /** Its count syllable: `1` on the beat, `&` or `la` between. */
  count: string;
  /** The eighth of the bar it starts on, from 1; null between eighths. */
  eighth: number | null;
  /** The felt beat it runs across or into, from 1. */
  hides: number;
  /** Crosses the middle of a four-beat bar (4/4), which notation shows. */
  middle: boolean;
}

export interface D29Verdict {
  check: BarCheck;
  hidden: HiddenBeat[];
  /** The meter of the same length the bar is right in, if it is wrong in its own. */
  partner: string | null;
}

export function d29Verdict(prompt: D29Prompt, answer: D29Answer): D29Verdict {
  const ts = signatureOf(prompt.meter);
  const bar = d29Bar(prompt, answer);
  const check = checkBar(bar, ts);
  const givenCount = rhythmOf(prompt.given).length;
  const bs = beats(ts);
  const starts = eventStarts(bar);
  const counts = countSyllables(bar, ts);
  const beatAt = (at: Frac) => bs.filter((b) => fracCmp(b.start, at) <= 0).length - 1;
  const hidden = check.hiddenBeats
    .filter((i) => i >= givenCount)
    .map((i): HiddenBeat => {
      const start = starts[i]!;
      const end = fracAdd(start, eventLength(bar[i]!));
      // `checkBar` flags only notes that run across a beat: the first one is the hidden beat.
      const hides = bs.findIndex((b) => fracCmp(b.start, start) > 0 && fracCmp(b.start, end) < 0);
      const middle = ts.top === 4 && meterKind(ts) === 'simple' && hides === 2;
      return {
        placed: i - givenCount,
        code: answer.placed[i - givenCount]!,
        beat: beatAt(start) + 1,
        count: counts[i]!,
        eighth: Number.isInteger(eighths(start)) ? eighths(start) + 1 : null,
        hides: hides + 1,
        middle,
      };
    });
  const partner = check.ok
    ? null
    : (partnersOf(prompt.meter).find((m) => checkBar(bar, signatureOf(m)).ok) ?? null);
  return { check, hidden, partner };
}

/** `dotted-quarter`, `quarter-note`, `half-note`: a beat's note, as an adjective. */
function beatNote(ts: TimeSignature): string {
  const unit = beatUnit(ts)!;
  const name = durationName(unit);
  return unit.dots ? name.replace(' ', '-') : `${name}-note`;
}

/** `2 dotted-quarter beats`, `3 quarter-note beats`. */
export function beatsPhrase(meter: string): string {
  const ts = signatureOf(meter);
  return `${feltBeats(ts)} ${beatNote(ts)} beats`;
}

export function d29Check(prompt: D29Prompt, answer: D29Answer): DrillCheck {
  const expected = `${prompt.meter}: ${beatsPhrase(prompt.meter)}`;
  const key = concept(prompt.meter);
  const { check, partner } = d29Verdict(prompt, answer);
  if (check.ok) return { correct: true, expected, concept: key };
  return {
    correct: false,
    expected,
    concept: key,
    ...(partner ? { confusedWith: concept(partner) } : {}),
  };
}

/** Stored as `answerGiven`: the placed values in the text form. */
export function d29DescribeAnswer(answer: D29Answer): string {
  return answer.placed.join(' ');
}

/** Time per value placed, so a whole bar meets the usual speed targets (design §3.2), as D12 and D38 grade. */
export function d29GradedResponseMs(_prompt: D29Prompt, answer: D29Answer, elapsedMs: number) {
  return elapsedMs / Math.max(1, answer.placed.length);
}

/** No notes to pluck: the view plays a bar on the timing engine's click when asked (rule 10). */
export function d29Sounds(): DrillSounds {
  return { expected: [] };
}

// --- Lengths in words -----------------------------------------------------------

const VALUES: readonly NoteValue[] = [1, 2, 4, 8, 16, 32, 64];

/** `halves`, `quarters`, `eighths`. */
function plural(value: NoteValue): string {
  const name = durationName({ value, dots: 0 });
  return name === 'half' ? 'halves' : `${name}s`;
}

/**
 * A length as notes: `an eighth`, `a dotted quarter`, `5 sixteenths`.
 * One value (with a dot) if one fits, else a count of the longest that does.
 */
export function lengthName(f: Frac): string {
  for (const value of VALUES) {
    for (const dots of [0, 1] as const) {
      if (fracEq(noteLength(value, dots), f)) {
        const name = durationName({ value, dots });
        return `${/^[aeiou]/.test(name) ? 'an' : 'a'} ${name}`;
      }
    }
  }
  const value = VALUES.find((v) => fracDiv(f, noteLength(v)).d === 1) ?? 64;
  return `${fracToNumber(fracDiv(f, noteLength(value)))} ${plural(value)}`;
}

/** What a bar holds: `6 eighths`, `3 quarters`, `2 halves`. */
export function barHolds(meter: string): string {
  const ts = signatureOf(meter);
  return `${ts.top} ${plural(ts.bottom)}`;
}

/** What the beats are, plural: `dotted quarters`, `quarters`, `halves`. */
export function beatUnitPlural(meter: string): string {
  const unit = beatUnit(signatureOf(meter))!;
  return `${unit.dots ? 'dotted ' : ''}${plural(unit.value)}`;
}

/** A value code's name: `4.` → `dotted quarter`, `r4` → `quarter rest`. */
export function valueName(code: string): string {
  const e = valueOf(code);
  return `${durationName({ value: e.value, dots: e.dots ?? 0 })}${e.rest ? ' rest' : ''}`;
}

/** Value codes as a list: `a quarter and an eighth`. */
export function valueList(codes: readonly string[]): string {
  const names = codes.map((c) => lengthName(rhythmLength([eventOf(c)])));
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

// --- Hearing a bar ------------------------------------------------------------

/** How to play a bar on the click: the grid, which steps sound, and where to stop. */
export interface HearPlan {
  /** Clicks per pulse: fine enough for every onset (at most 4, the metronome's limit). */
  subdivide: 1 | 2 | 3 | 4;
  /** The steps (pulses × `subdivide`, from the bar's start) a note starts on. */
  steps: number[];
  /** The pulse to stop on: the bar's end, or the last note's if it runs over. */
  endPulse: number;
}

export function hearPlan(rhythm: string, meter: string): HearPlan {
  const ts = signatureOf(meter);
  const r = rhythmOf(rhythm);
  const pulses = onsetPulses(r, pulseLength(ts));
  const subdivide =
    ([1, 2, 3, 4] as const).find((s) => pulses.every((p) => Number.isInteger(p * s))) ?? 4;
  const length = fracToNumber(fracDiv(rhythmLength(r), pulseLength(ts)));
  return {
    subdivide,
    // A sixteenth in 2/2 is an eighth of a pulse: it sounds on the nearest step.
    steps: pulses.map((p) => Math.round(p * subdivide)),
    endPulse: Math.max(ts.top, Math.ceil(length)),
  };
}

/**
 * The click for a bar: one bar of its beats to count in, then a click on
 * each note, accented by where it falls, and silence on the steps between.
 * The view stops the run at `endPulse`.
 */
export function d29HearOptions(rhythm: string, meter: string): MetronomeOptions {
  const ts = signatureOf(meter);
  const { subdivide, steps } = hearPlan(rhythm, meter);
  const sounding = new Set(steps);
  return {
    meter: clickMeter(ts),
    bpm: ENGINE_CONFIG.completeBar.feltBeatsPerMinute * beats(ts)[0]!.pulses,
    subdivide,
    countInBars: 1,
    fade: (click) =>
      click.countIn
        ? Number.isInteger(click.pulse)
        : sounding.has(Math.round(click.pulse * subdivide)),
  };
}

// --- Keyboard -----------------------------------------------------------------

export type D29KeyAction = { type: 'add'; index: number } | { type: 'undo' } | { type: 'check' };

/**
 * Hardware-keyboard answers (design §7): 1–6 place a palette value,
 * Backspace undoes, and Enter checks.
 */
export function d29KeyAction(key: string, paletteSize: number): D29KeyAction | null {
  if (key === 'Backspace') return { type: 'undo' };
  if (key === 'Enter') return { type: 'check' };
  const n = Number(key);
  if (/^[1-9]$/.test(key) && n <= paletteSize) return { type: 'add', index: n - 1 };
  return null;
}

/** Move one placed value left or right; unchanged at the ends. */
export function moveValue(placed: readonly string[], from: number, to: number): string[] {
  if (to < 0 || to >= placed.length || from === to) return [...placed];
  const next = [...placed];
  const [v] = next.splice(from, 1);
  next.splice(to, 0, v!);
  return next;
}

/** Put a value in at `at` (the end when past it). */
export function insertValue(placed: readonly string[], at: number, code: string): string[] {
  const next = [...placed];
  next.splice(Math.max(0, Math.min(at, next.length)), 0, code);
  return next;
}

/** The bar's length in eighths, for sizing its picture: 6/8 and 3/4 line up. */
export function eighths(f: Frac): number {
  return fracToNumber(f) * 8;
}
