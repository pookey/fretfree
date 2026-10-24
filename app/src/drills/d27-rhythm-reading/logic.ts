import { Rating, type Grade } from 'ts-fsrs';
import { ENGINE_CONFIG } from '../../engine/config';
import { parseRhythmCellItemId } from '../../engine/items/rhythm-cell';
import type { Item, TimingWindow } from '../../engine/model';
import {
  RHYTHM_CELLS,
  barFromCells,
  barLength,
  beats,
  countSyllables,
  feltBeats,
  formatRhythm,
  frac,
  fracDiv,
  fracToNumber,
  meterKind,
  onsetPulses,
  onsets,
  parseRhythm,
  parseTimeSignature,
  pulseLength,
  rhythmCell,
  type RhythmCell,
  type RhythmEvent,
  type TimeSignature,
} from '../../theory';
import {
  alignOnsets,
  gradeTiming,
  summariseTiming,
  type TimingGradeConfig,
  type TimingSummary,
} from '../../timing/grade';
import type { OnsetKind } from '../../timing/latency';
import type { DrillCheck, DrillContext, DrillFeedback, DrillSounds } from '../types';
import { D27_SCOPE } from './meta';

export { D27_ID, D27_SCOPE, d27CanTest, d27ConceptOf } from './meta';

/**
 * D27 "Rhythm reading" (design §6, §12), the pure half. A bar is written on
 * the staff with the card's rhythm cell in it; a bar of count-in, then the
 * learner taps it `bars` times through against the timing engine's click,
 * or plays it on a guitar in mic mode.
 *
 * - **Sound before symbol** (design §12): a cell's first rep (the worked
 *   example) plays the bar before its notation shows. The view does that,
 *   from `d27HearPlan`.
 * - **Confusables side by side** (research/02 rule 6): from scope level 1
 *   the bar writes the cell beside its confusable partner (dotted next to
 *   straight), so the dot is what the rep reads. A failed rep that fits the
 *   partner's rhythm is logged as that confusion (`confusedWith`), so the
 *   session builder pairs the two cards from then on.
 * - **Varied bars** (rule 12): the meter, the plain cells around the cell
 *   and the tempo are drawn per prompt; scope (rule 5) widens the bar from
 *   the cell repeated to a mixed bar, and the tempo band.
 *
 * Grading is the timing engine's, as D20's: `alignOnsets` matches the
 * learner's onsets to the notes, and `gradeTiming` makes the FSRS rating
 * with the learner's timing window. That replaces the speed grade
 * (`DrillLogic.rating`).
 */

const CFG = ENGINE_CONFIG.rhythmReading;

export type BarStyle = (typeof CFG.levels)[number]['bar'];

export interface D27Prompt {
  itemId: string;
  /** The cell's slug: `dotted-8th-16th`. */
  cell: string;
  /** The cell's name: "Dotted eighth and sixteenth". */
  name: string;
  meter: string;
  /** The written bar, in the text form (`parseRhythm`). */
  bar: string;
  style: BarStyle;
  /** The bar's events that are the card's cell, by index. */
  cellEvents: number[];
  /** The cell's confusable partner, when a rep can be confused with it; `null` for none. */
  partner: string | null;
  /** Pulses a minute, as the metronome counts them (eighths in 6/8). */
  bpm: number;
  countInBars: number;
  /** Times through the bar. */
  bars: number;
  /** Click steps per pulse: the grid every note of the bar sits on, 1–4. */
  subdivide: number;
  /** Every note of the run, in pulses from the first beat after the count-in. */
  pulses: number[];
  /** The run with the cell played as its partner, for spotting that confusion; `null` without one. */
  partnerPulses: number[] | null;
}

export interface D27Answer {
  input: OnsetKind;
  /** When each note was due, audio-clock ms (`metronome.timeAtPulse`), one per `prompt.pulses`. */
  targetsMs: number[];
  /** When each note of `prompt.partnerPulses` was due; empty without one. */
  partnerTargetsMs: number[];
  /** The learner's onsets in the run, latency taken off, audio-clock ms. */
  onsetsMs: number[];
  /** The timing window the rep is graded with: `settings.timingWindow` when it was played. */
  window: TimingWindow;
}

// --- Cells and meters ----------------------------------------------------------

const SIGNATURES = new Map<string, TimeSignature>();

export function signatureOf(meter: string): TimeSignature {
  let ts = SIGNATURES.get(meter);
  if (!ts) {
    ts = parseTimeSignature(meter);
    SIGNATURES.set(meter, ts);
  }
  return ts;
}

/** Pulses in a bar: 4 in 4/4, 6 in 6/8. */
export function pulsesPerBar(ts: TimeSignature): number {
  return fracToNumber(fracDiv(barLength(ts), pulseLength(ts)));
}

/** Cell slots in a bar: quarters in simple time, dotted-quarter beats in compound. */
function slotsOf(ts: TimeSignature): number {
  return meterKind(ts) === 'compound'
    ? feltBeats(ts)
    : fracToNumber(fracDiv(barLength(ts), frac(1, 4)));
}

function hasOnsets(cell: RhythmCell): boolean {
  return onsets(cell.rhythm).length > 0;
}

/**
 * The fewest click steps per pulse that put every pulse on a step, 1–4, or
 * `null` when none does (triplets beside sixteenths).
 */
export function gridOf(pulses: readonly number[]): number | null {
  const on = (x: number) => Math.abs(x - Math.round(x)) < 1e-6;
  return [1, 2, 3, 4].find((s) => pulses.every((p) => on(p * s))) ?? null;
}

/** A cell's grid in a meter's pulses: 2 for eighths in 4/4, 3 for a triplet. */
function cellGrid(cell: RhythmCell, ts: TimeSignature): number {
  return gridOf(onsetPulses(cell.rhythm, pulseLength(ts))) ?? 4;
}

/** Cells that can share a bar: one click grid of at most 4 steps a pulse holds both. */
function sameGrid(a: RhythmCell, b: RhythmCell, ts: TimeSignature): boolean {
  const ga = cellGrid(a, ts);
  const gb = cellGrid(b, ts);
  const lcm = (ga * gb) / gcd(ga, gb);
  return lcm <= 4;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/**
 * The partner a cell is confused with: its `confusable`, when it has the
 * same feel and length (so one can stand for the other in a bar) and is
 * taught no later, so a bar never writes a cell the learner hasn't met.
 */
export function partnerOf(cell: RhythmCell): RhythmCell | null {
  if (!cell.confusable) return null;
  const p = rhythmCell(cell.confusable);
  return p.feel === cell.feel && p.beats === cell.beats && p.stage <= cell.stage ? p : null;
}

/** The one-beat cell that fills a gap: a quarter, or a dotted quarter in compound time. */
function anchorOf(cell: RhythmCell): RhythmCell {
  return rhythmCell(cell.feel === 'compound' ? 'dotted-quarter' : 'quarter');
}

/** Plain cells to fill a bar around the card's: stage 1, with a note, on the cell's grid. */
function fillersOf(cell: RhythmCell, partner: RhythmCell | null, ts: TimeSignature): RhythmCell[] {
  return RHYTHM_CELLS.filter(
    (c) =>
      c.feel === cell.feel &&
      c.stage === 1 &&
      c.slug !== cell.slug &&
      c.slug !== partner?.slug &&
      hasOnsets(c) &&
      sameGrid(c, cell, ts),
  );
}

// --- Building the bar ----------------------------------------------------------

function pick<T>(xs: readonly T[], rng: () => number): T {
  return xs[Math.min(xs.length - 1, Math.floor(rng() * xs.length))]!;
}

function shuffle<T>(xs: readonly T[], rng: () => number): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.min(i, Math.floor(rng() * (i + 1)));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** A cell laid in a bar, and whether it is the card's (tested) cell. */
interface Laid {
  cell: RhythmCell;
  tested: boolean;
}

function beatsOf(laid: readonly Laid[]): number {
  return laid.reduce((sum, l) => sum + l.cell.beats, 0);
}

/** Repeats `pattern` while it fits in `slots`, then tops up with one-beat `anchor`s. */
function repeatFill(pattern: readonly Laid[], slots: number, anchor: RhythmCell): Laid[] {
  const out: Laid[] = [];
  for (let i = 0; ; i += 1) {
    const next = pattern[i % pattern.length]!;
    if (beatsOf(out) + next.cell.beats > slots) break;
    out.push(next);
  }
  while (beatsOf(out) < slots) out.push({ cell: anchor, tested: false });
  return out;
}

/** The cell over and over; a cell without a note (a rest) takes turns with a quarter. */
function blockedBar(cell: RhythmCell, slots: number): Laid[] {
  const anchor = anchorOf(cell);
  const me = { cell, tested: true };
  return repeatFill(hasOnsets(cell) ? [me] : [{ cell: anchor, tested: false }, me], slots, anchor);
}

/** The cell and its partner taking turns, the cell first. */
function contrastBar(cell: RhythmCell, partner: RhythmCell, slots: number): Laid[] {
  return repeatFill(
    [
      { cell, tested: true },
      { cell: partner, tested: false },
    ],
    slots,
    anchorOf(cell),
  );
}

/** The cell (twice when it fits), its partner, and plain cells, in a random order. */
function mixedBar(
  cell: RhythmCell,
  partner: RhythmCell | null,
  slots: number,
  ts: TimeSignature,
  rng: () => number,
): Laid[] {
  const bag: Laid[] = [{ cell, tested: true }];
  if (partner && beatsOf(bag) + partner.beats <= slots) bag.push({ cell: partner, tested: false });
  // A rest cell once: twice can leave a bar with almost nothing to play.
  if (hasOnsets(cell) && beatsOf(bag) + cell.beats <= slots) bag.push({ cell, tested: true });
  const fillers = fillersOf(cell, partner, ts);
  while (beatsOf(bag) < slots) {
    const left = slots - beatsOf(bag);
    const fits = fillers.filter((c) => c.beats <= left);
    bag.push({ cell: fits.length ? pick(fits, rng) : anchorOf(cell), tested: false });
  }
  return shuffle(bag, rng);
}

/** Notes a bar needs: a timing grade of one note is a coin toss. */
const MIN_NOTES = 2;

/**
 * The bar's events, or `null` when the cells don't make a bar of the meter
 * (`barFromCells`) or leave it with fewer than `MIN_NOTES` notes.
 */
function eventsOf(laid: readonly Laid[], ts: TimeSignature): RhythmEvent[] | null {
  try {
    const events = barFromCells(
      laid.map((l) => l.cell),
      ts,
    );
    return onsets(events).length >= MIN_NOTES ? events : null;
  } catch {
    return null;
  }
}

/** The meters a bar can be written in: the slots it needs fit. */
function metersFor(cell: RhythmCell, needs: number): string[] {
  const meters: readonly string[] = CFG.meters[cell.feel];
  const fit = meters.filter((m) => slotsOf(signatureOf(m)) >= needs);
  return fit.length ? fit : [meters[0]!];
}

export interface BuiltBar {
  meter: string;
  style: BarStyle;
  laid: Laid[];
  events: RhythmEvent[];
}

/** How many tries a mixed bar gets at an order that makes a bar before falling back. */
const MIX_TRIES = 8;

/**
 * The bar for a cell at a scope level. A blocked bar is in the feel's first
 * meter (4/4, 6/8); the others pick a meter the cells fit. A bar that hides
 * a beat (a syncopated cell across the middle of 4/4) is drawn again, and
 * falls back to the contrast and then the blocked bar, which always fits.
 */
export function buildBar(cell: RhythmCell, style: BarStyle, rng: () => number): BuiltBar {
  const home = CFG.meters[cell.feel][0];
  // A feel's meters share a pulse, so a partner on the cell's grid in one is in all.
  const partner = partnerOf(cell);
  const paired = partner && sameGrid(cell, partner, signatureOf(home)) ? partner : null;
  // Without a partner to write beside it, a contrast bar is a mixed one.
  const want = style === 'contrast' && !paired ? 'mixed' : style;
  if (want === 'mixed') {
    const meter = pick(metersFor(cell, cell.beats + (paired?.beats ?? 0)), rng);
    const ts = signatureOf(meter);
    for (let i = 0; i < MIX_TRIES; i += 1) {
      const laid = mixedBar(cell, paired, slotsOf(ts), ts, rng);
      const events = eventsOf(laid, ts);
      if (events) return { meter, style: 'mixed', laid, events };
    }
  }
  if (want !== 'blocked' && paired) {
    const meter = pick(metersFor(cell, cell.beats + paired.beats), rng);
    const ts = signatureOf(meter);
    const laid = contrastBar(cell, paired, slotsOf(ts));
    const events = eventsOf(laid, ts);
    if (events) return { meter, style: 'contrast', laid, events };
  }
  const ts = signatureOf(home);
  const meter = home;
  const laid = blockedBar(cell, slotsOf(ts));
  const events = eventsOf(laid, ts);
  if (!events) throw new RangeError(`D27 can't write ${cell.slug} in ${meter}`);
  return { meter, style: 'blocked', laid, events };
}

/** Event indexes of the laid cells that are tested. */
function testedEvents(laid: readonly Laid[]): number[] {
  const out: number[] = [];
  let at = 0;
  for (const l of laid) {
    if (l.tested) l.cell.rhythm.forEach((_, i) => out.push(at + i));
    at += l.cell.rhythm.length;
  }
  return out;
}

/** The bar's notes over `bars` times through, in pulses from pulse 0. */
export function runPulses(events: readonly RhythmEvent[], ts: TimeSignature, bars: number) {
  const one = onsetPulses(events, pulseLength(ts));
  const per = pulsesPerBar(ts);
  return Array.from({ length: bars }, (_, b) => one.map((p) => b * per + p)).flat();
}

/** The shortest gap between notes in pulses, the repeat's barline included. */
function shortestGap(pulses: readonly number[], perBar: number): number {
  let gap = perBar;
  pulses.forEach((p, i) => {
    const next = pulses[i + 1];
    if (next !== undefined) gap = Math.min(gap, next - p);
  });
  return gap;
}

/** The scope level's settings; out-of-range levels clamp. */
export function d27Level(scopeLevel: number) {
  const i = Math.max(D27_SCOPE.minLevel, Math.min(D27_SCOPE.maxLevel, Math.round(scopeLevel)));
  return CFG.levels[i]!;
}

/**
 * A tempo in click pulses a minute: a felt-beat tempo from the level's band,
 * in multiples of `tempoStep`, times the pulses in a beat (3 in 6/8), and
 * slowed so the notes come no faster than `maxNotesPerMinute`.
 */
export function d27Tempo(
  ts: TimeSignature,
  pulses: readonly number[],
  scopeLevel: number,
  rng: () => number,
): number {
  const [lo, hi] = d27Level(scopeLevel).tempo;
  const steps = Math.floor((hi - lo) / CFG.tempoStep);
  const felt = lo + Math.min(steps, Math.floor(rng() * (steps + 1))) * CFG.tempoStep;
  const bpm = felt * beats(ts)[0]!.pulses;
  const fastest = CFG.maxNotesPerMinute * shortestGap(pulses, pulsesPerBar(ts));
  return Math.min(bpm, Math.floor(fastest / CFG.tempoStep) * CFG.tempoStep);
}

export function d27MakePrompt(item: Item, ctx: DrillContext): D27Prompt {
  const ref = parseRhythmCellItemId(item.id);
  if (!ref) throw new Error(`D27 cannot test item ${item.id}`);
  const cell = rhythmCell(ref.slug);
  const built = buildBar(cell, d27Level(ctx.scopeLevel).bar, ctx.rng);
  const ts = signatureOf(built.meter);
  const pulses = runPulses(built.events, ts, CFG.bars);
  const partner = partnerOf(cell);
  // The same bar with every tested cell played as the partner instead.
  const asPartner = partner
    ? built.laid.flatMap((l) => (l.tested ? partner.rhythm : l.cell.rhythm))
    : null;
  return {
    itemId: item.id,
    cell: cell.slug,
    name: cell.name,
    meter: built.meter,
    bar: formatRhythm(built.events),
    style: built.style,
    cellEvents: testedEvents(built.laid),
    partner: partner?.slug ?? null,
    bpm: d27Tempo(ts, pulses, ctx.scopeLevel, ctx.rng),
    countInBars: CFG.countInBars,
    bars: CFG.bars,
    subdivide: gridOf(pulses) ?? 1,
    pulses,
    partnerPulses: asPartner ? runPulses(asPartner, ts, CFG.bars) : null,
  };
}

/** The written bar's events. */
export function d27Events(prompt: Pick<D27Prompt, 'bar'>): RhythmEvent[] {
  return parseRhythm(prompt.bar);
}

// --- Hearing it ---------------------------------------------------------------

export interface HearPlan {
  /** Click steps of the bar (in `prompt.subdivide`ths of a pulse) that sound: one per note. */
  steps: number[];
  /** The pulse the bar ends on, where the hearing stops. */
  endPulse: number;
}

/**
 * The bar played on the click, for sound before symbol (design §12): a bar
 * of beats to count in, then a click on each note, at the tempo the rep
 * will be tapped at.
 */
export function d27HearPlan(prompt: D27Prompt): HearPlan {
  const ts = signatureOf(prompt.meter);
  const per = pulsesPerBar(ts);
  return {
    steps: prompt.pulses.filter((p) => p < per).map((p) => Math.round(p * prompt.subdivide)),
    endPulse: per,
  };
}

// --- Grading ------------------------------------------------------------------

/** The grade for a timing window: its on-time, target and fluent windows, and D27's shared rest. */
export function d27GradeConfig(window: TimingWindow): TimingGradeConfig {
  return { ...CFG.grade, ...ENGINE_CONFIG.rhythm.windows[window] };
}

export interface D27Result {
  /** Per note, in order: the matched onset's offset (ms, + late), or `null` for a miss. */
  offsets: (number | null)[];
  extras: number;
  summary: TimingSummary;
  /** The rating before any hint cap. */
  rating: Grade;
  /** On-time notes a pass needs, with the extras counted. */
  needed: number;
}

function resultOf(targetsMs: readonly number[], answer: D27Answer): D27Result {
  const cfg = d27GradeConfig(answer.window);
  const { offsets, extras } = alignOnsets(targetsMs, answer.onsetsMs, cfg.matchMs);
  return {
    offsets,
    extras: extras.length,
    summary: summariseTiming(offsets, cfg, extras.length),
    rating: gradeTiming(offsets, cfg, { extras: extras.length }),
    needed: Math.ceil(cfg.passRate * (offsets.length + extras.length)),
  };
}

export function d27Result(answer: D27Answer): D27Result {
  return resultOf(answer.targetsMs, answer);
}

/**
 * The partner the rep was played as, if it failed as written but would have
 * passed as the partner: two even eighths tapped for a dotted pair.
 */
export function d27Confusion(prompt: D27Prompt, answer: D27Answer): string | null {
  if (!prompt.partner || answer.partnerTargetsMs.length === 0) return null;
  if (d27Result(answer).rating !== Rating.Again) return null;
  return resultOf(answer.partnerTargetsMs, answer).rating === Rating.Again ? null : prompt.partner;
}

function extrasLine(extras: number): string {
  return extras === 0 ? '' : `, ${extras} extra ${extras === 1 ? 'tap' : 'taps'}`;
}

export function d27Check(prompt: D27Prompt, answer: D27Answer): DrillCheck {
  const r = d27Result(answer);
  const { onTime, targets } = r.summary;
  if (r.rating !== Rating.Again)
    return { correct: true, expected: `${onTime} of ${targets} on time`, concept: prompt.itemId };
  const confused = d27Confusion(prompt, answer);
  return {
    correct: false,
    expected: `${onTime} of ${targets} on time (${r.needed} needed${extrasLine(r.extras)})`,
    concept: prompt.itemId,
    ...(confused ? { confusedWith: rhythmCell(confused).id } : {}),
  };
}

/** The timing grade, capped at Hard after a worked example (design §3.2). */
export function d27Rating(
  _prompt: D27Prompt,
  answer: D27Answer,
  { hintUsed }: { hintUsed: boolean },
): Grade {
  const r = d27Result(answer);
  return gradeTiming(r.offsets, d27GradeConfig(answer.window), { extras: r.extras, hintUsed });
}

/**
 * The typical timing error of a rep within the target, so it counts as fluent;
 * the time the rep took otherwise, which is well past any speed target.
 */
export function d27GradedResponseMs(
  _prompt: D27Prompt,
  answer: D27Answer,
  elapsedMs: number,
): number {
  const { medianAbsMs } = d27Result(answer).summary;
  const { targetMs } = ENGINE_CONFIG.rhythm.windows[answer.window];
  return medianAbsMs !== null && medianAbsMs <= targetMs ? medianAbsMs : elapsedMs;
}

/** Each note's offset, for the review log: `tap: +12 -5 miss +30, 1 extra tap`. */
export function d27DescribeAnswer(answer: D27Answer): string {
  const r = d27Result(answer);
  const notes = r.offsets.map((o) => {
    if (o === null) return 'miss';
    const ms = Math.round(o);
    return ms > 0 ? `+${ms}` : `${ms}`;
  });
  return `${answer.input}: ${notes.join(' ')}${extrasLine(r.extras)}`;
}

/** Nothing to play back: the click was the sound, and the view can play the bar. */
export function d27Sounds(_prompt: D27Prompt, _feedback: DrillFeedback<D27Answer>): DrillSounds {
  return { expected: [] };
}

// --- Feedback -----------------------------------------------------------------

export type NoteVerdict = 'on' | 'early' | 'late' | 'miss';

export interface NoteMark {
  /** Which time through the bar, from 0. */
  pass: number;
  /** The note's event in the bar. */
  event: number;
  /** How it is counted: "1", "e", "&", "trip". */
  syllable: string;
  offsetMs: number | null;
  verdict: NoteVerdict;
}

/** What each note of the bar is counted as, by event: "1 e & a", "1 la li". */
export function d27Syllables(prompt: D27Prompt): string[] {
  return countSyllables(d27Events(prompt), signatureOf(prompt.meter));
}

/** Every note of the run with how it landed, for the feedback rows. */
export function d27Marks(prompt: D27Prompt, answer: D27Answer): NoteMark[] {
  const events = d27Events(prompt);
  const notes = onsets(events);
  const syllables = countSyllables(events, signatureOf(prompt.meter));
  const { offsets } = d27Result(answer);
  const { onTimeMs } = ENGINE_CONFIG.rhythm.windows[answer.window];
  return offsets.map((o, i) => {
    const event = notes[i % notes.length]!.index;
    let verdict: NoteVerdict;
    if (o === null) verdict = 'miss';
    else if (Math.abs(o) <= onTimeMs) verdict = 'on';
    else verdict = o < 0 ? 'early' : 'late';
    return {
      pass: Math.floor(i / notes.length),
      event,
      syllable: syllables[event] ?? '',
      offsetMs: o === null ? null : Math.round(o),
      verdict,
    };
  });
}

/**
 * Where a tap sits in its box: -1 at the box's left edge (early), 0 on the
 * note, 1 at its right edge (late). The edges are `grade.matchMs`. The scale
 * is a square root, so a tap just outside the window sits clear of the line.
 */
export function d27MarkX(offsetMs: number): number {
  const x = Math.sqrt(Math.min(1, Math.abs(offsetMs) / CFG.grade.matchMs));
  return offsetMs < 0 ? -x : x;
}

/** "12 ms late", "right on time". */
export function d27DescribeOffset(ms: number): string {
  const r = Math.round(ms);
  if (Math.abs(r) < 1) return 'right on time';
  return `${Math.abs(r)} ms ${r > 0 ? 'late' : 'early'}`;
}

const isDotted = (c: RhythmCell) => c.rhythm.some((e) => (e.dots ?? 0) > 0);
const hasRest = (c: RhythmCell) => c.rhythm.some((e) => e.rest);
const hasTuplet = (c: RhythmCell) => c.rhythm.some((e) => e.tuplet);

/** Why a cell isn't its partner: the thing on the page to read again. */
export function d27Difference(cellSlug: string, partnerSlug: string): string {
  const cell = rhythmCell(cellSlug);
  const partner = rhythmCell(partnerSlug);
  if (isDotted(cell) && !isDotted(partner))
    return 'Read the dot: it adds half again, so the dotted note lasts three times as long as the short one beside it.';
  if (isDotted(partner) && !isDotted(cell)) return 'There’s no dot here: the notes are even.';
  if (hasRest(cell) && !hasRest(partner))
    return 'Read the rest: it’s silent, so leave a gap where it is.';
  if (hasTuplet(cell) && !hasTuplet(partner))
    return 'The triplet fits three even notes into the time of two.';
  if (hasTuplet(partner) && !hasTuplet(cell)) return 'No triplet here: two notes fill the time.';
  return 'Look at which note is short and which is long, then count where each one starts.';
}

/**
 * How the rep went, after the grade: the partner it was played as, if any,
 * how tight the on-time notes were, and whether they leaned early or late.
 */
export function d27Explain(prompt: D27Prompt, feedback: DrillFeedback<D27Answer>): string {
  const r = d27Result(feedback.answer);
  const { medianAbsMs, meanOffsetMs, misses } = r.summary;
  const { onTimeMs, targetMs, fluentMs } = ENGINE_CONFIG.rhythm.windows[feedback.answer.window];
  const parts: string[] = [];
  const confused = d27Confusion(prompt, feedback.answer);
  const matched = r.offsets.filter((o): o is number => o !== null);
  if (confused) {
    const partner = rhythmCell(confused);
    parts.push(
      `That was played as ${partner.name.toLowerCase()}, not ${prompt.name.toLowerCase()}.`,
      d27Difference(prompt.cell, confused),
    );
  } else if (matched.length === 0) {
    parts.push('No taps landed near the notes. Listen to the count-in, then start on “1”.');
  } else if (medianAbsMs === null) {
    const off = Math.round(matched.reduce((sum, o) => sum + Math.abs(o), 0) / matched.length);
    parts.push(`Your taps were ${off} ms off on average. Within ${onTimeMs} ms counts.`);
  } else {
    parts.push(`Typically ${Math.round(medianAbsMs)} ms off (aim for ${targetMs}).`);
    if (meanOffsetMs !== null && Math.abs(meanOffsetMs) > fluentMs) {
      parts.push(
        meanOffsetMs < 0
          ? `You’re rushing: ${Math.round(-meanOffsetMs)} ms early on average.`
          : `You’re dragging: ${Math.round(meanOffsetMs)} ms late on average.`,
      );
    }
    if (misses > 0) parts.push(`${misses} missed.`);
    if (r.extras > 0)
      parts.push(`${r.extras} extra ${r.extras === 1 ? 'tap' : 'taps'} between the notes.`);
  }
  return parts.join(' ');
}
