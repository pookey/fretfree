import { State } from 'ts-fsrs';
import { ENGINE_CONFIG } from '../../engine/config';
import type { SpeedTargets } from '../../engine/grading';
import { median } from '../../engine/mastery';
import { parseItemId, type CardRecord, type ReviewLogRecord } from '../../engine/model';
import { FRETS_0_12 } from '../../engine/skills/helpers';
import {
  STANDARD_TUNING,
  allStrings,
  cellLabel,
  chromaOf,
  noteAt,
  stringCount,
  type AccidentalPref,
  type FretRange,
  type Position,
  type Tuning,
} from '../../theory';

/**
 * The Progress fretboard heatmap (design §7, research/02 rule 15). Pure: the
 * caller passes `now` and the FSRS retrievability function in.
 *
 * A cell's facts are its position→name card (`note@s5f7`) and every
 * name→position card that lands on it (`find:E@s5` covers each fret 0–12 where
 * E sits on string 5). A cell is only as well known as its weakest practised
 * direction, so stability and recall take the minimum across those cards.
 */

const DAY_MS = 86_400_000;

export type Retrievability = (card: CardRecord, at: Date) => number;

export interface HeatmapConfig {
  stabilityBandsDays: readonly number[];
  recentAnswers: number;
  forecastDays: number;
}

export interface HeatCell extends Position {
  /** Stability of the weakest practised card, in days; `null` when not practised yet. */
  stabilityDays: number | null;
  /** Index into the stability bands (0 = least stable); `null` when not practised. */
  band: number | null;
  /** Median response time of the latest correct, unguided answers. */
  medianMs: number | null;
  /** Median response time is over the learner's target (design §3.2). */
  slow: boolean;
  /** Unguided answers, and how many were right (guided reps show the answer). */
  reviews: number;
  correct: number;
  /** Predicted recall of the weakest practised card, now and at the forecast horizon. */
  recallNow: number | null;
  recallForecast: number | null;
  /** The soonest review due among the cell's practised cards. */
  nextDue: Date | null;
}

export interface StringForecast {
  string: number;
  /** Practised cards (both directions) on this string. */
  practised: number;
  /** Mean predicted recall of those cards at the forecast horizon. */
  recall: number | null;
}

/** The neck positions an item tests: one for `note@`, every match in frets 0–12 for `find:`. */
export function itemPositions(itemId: string, tuning: Tuning = STANDARD_TUNING): Position[] {
  const ref = parseItemId(itemId);
  if (!ref) return [];
  const strings = stringCount(tuning);
  if (ref.kind === 'note') {
    const { string } = ref.position;
    return string >= 1 && string <= strings ? [ref.position] : [];
  }
  if (ref.kind === 'find') {
    if (ref.string < 1 || ref.string > strings) return [];
    const chroma = chromaOf(ref.pc);
    return FRETS_0_12.filter(
      (fret) => noteAt({ string: ref.string, fret }, tuning).chroma === chroma,
    ).map((fret) => ({ string: ref.string, fret }));
  }
  return [];
}

/** The string a neck item belongs to, or `null` for items that aren't about a string. */
export function itemString(itemId: string): number | null {
  const ref = parseItemId(itemId);
  if (ref?.kind === 'note') return ref.position.string;
  if (ref?.kind === 'find') return ref.string;
  return null;
}

export function isPractised(card: CardRecord): boolean {
  return card.fsrs.state !== State.New;
}

/** Band index for a stability: the first upper bound it is under, else the top band. */
export function stabilityBand(days: number, bounds: readonly number[]): number {
  const i = bounds.findIndex((b) => days < b);
  return i === -1 ? bounds.length : i;
}

/** Legend copy for each band, e.g. "Under 1 day", "1–7 days", "90 days or more". */
export function bandLabels(bounds: readonly number[]): string[] {
  const days = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`;
  return [...bounds, Infinity].map((upper, i) => {
    const lower = bounds[i - 1];
    if (lower === undefined) return `Under ${days(upper)}`;
    if (upper === Infinity) return `${days(lower)} or more`;
    return `${lower}–${days(upper)}`;
  });
}

const key = (p: Position) => `s${p.string}f${p.fret}`;

export function buildHeatmap(input: {
  cards: readonly CardRecord[];
  logs: readonly ReviewLogRecord[];
  fretRange: FretRange;
  targets: SpeedTargets;
  now: Date;
  retrievability: Retrievability;
  tuning?: Tuning;
  cfg?: HeatmapConfig;
}): HeatCell[] {
  const { targets, now, retrievability, tuning = STANDARD_TUNING } = input;
  const cfg = input.cfg ?? ENGINE_CONFIG.heatmap;
  const horizon = new Date(now.getTime() + cfg.forecastDays * DAY_MS);

  const cardsAt = new Map<string, CardRecord[]>();
  for (const card of input.cards) {
    if (!isPractised(card)) continue;
    for (const p of itemPositions(card.itemId, tuning)) {
      const list = cardsAt.get(key(p)) ?? [];
      list.push(card);
      cardsAt.set(key(p), list);
    }
  }
  const logsAt = new Map<string, ReviewLogRecord[]>();
  const positionsOf = new Map<string, Position[]>();
  for (const log of input.logs) {
    let positions = positionsOf.get(log.itemId);
    if (!positions) {
      positions = itemPositions(log.itemId, tuning);
      positionsOf.set(log.itemId, positions);
    }
    for (const p of positions) {
      const list = logsAt.get(key(p)) ?? [];
      list.push(log);
      logsAt.set(key(p), list);
    }
  }

  const cells: HeatCell[] = [];
  for (const string of allStrings(tuning)) {
    for (let fret = input.fretRange.from; fret <= input.fretRange.to; fret++) {
      const cards = cardsAt.get(key({ string, fret })) ?? [];
      const logs = [...(logsAt.get(key({ string, fret })) ?? [])].sort(
        (a, b) => a.at.getTime() - b.at.getTime(),
      );
      // Guided reps are worked examples, not evidence of recall (as in the
      // session runner and the speed achievement), so they don't count.
      const recalled = logs.filter((l) => !l.hintUsed);
      const correct = recalled.filter((l) => l.correct);
      const medianMs = median(correct.slice(-cfg.recentAnswers).map((l) => l.responseMs));
      const minOf = (values: number[]) => (values.length ? Math.min(...values) : null);
      const stabilityDays = minOf(cards.map((c) => c.fsrs.stability));
      const due = minOf(cards.map((c) => c.fsrs.due.getTime()));
      cells.push({
        string,
        fret,
        stabilityDays,
        band: stabilityDays === null ? null : stabilityBand(stabilityDays, cfg.stabilityBandsDays),
        medianMs,
        slow: medianMs !== null && medianMs > targets.targetMs,
        reviews: recalled.length,
        correct: correct.length,
        recallNow: minOf(cards.map((c) => retrievability(c, now))),
        recallForecast: minOf(cards.map((c) => retrievability(c, horizon))),
        nextDue: due === null ? null : new Date(due),
      });
    }
  }
  return cells;
}

/**
 * "You'll remember ~92% of string 5 next week": the mean FSRS retrievability,
 * at the forecast horizon, of every practised card on each string. Strings
 * with nothing practised have `recall: null`.
 */
export function forecastByString(input: {
  cards: readonly CardRecord[];
  now: Date;
  retrievability: Retrievability;
  tuning?: Tuning;
  cfg?: Pick<HeatmapConfig, 'forecastDays'>;
}): StringForecast[] {
  const cfg = input.cfg ?? ENGINE_CONFIG.heatmap;
  const horizon = new Date(input.now.getTime() + cfg.forecastDays * DAY_MS);
  const strings = allStrings(input.tuning);
  const recalls = new Map<number, number[]>(strings.map((s) => [s, []]));
  for (const card of input.cards) {
    if (!isPractised(card)) continue;
    const string = itemString(card.itemId);
    if (string !== null) recalls.get(string)?.push(input.retrievability(card, horizon));
  }
  return strings.map((string) => {
    const values = recalls.get(string) ?? [];
    return {
      string,
      practised: values.length,
      recall: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null,
    };
  });
}

// --- Copy -------------------------------------------------------------------

export function formatPercent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

export function formatDays(days: number): string {
  if (days < 1) return 'under a day';
  const n = Math.round(days);
  return `${n} ${n === 1 ? 'day' : 'days'}`;
}

export function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

export function formatDue(due: Date, now: Date): string {
  const days = (due.getTime() - now.getTime()) / DAY_MS;
  if (days <= 0) return 'due now';
  if (days < 1) return 'due within a day';
  const n = Math.round(days);
  return `due in ${n} ${n === 1 ? 'day' : 'days'}`;
}

/** The forecast sentence for one string. */
export function forecastSentence(f: StringForecast, forecastDays: number): string {
  if (f.recall === null) return `String ${f.string}: nothing practised yet.`;
  const when = forecastDays === 7 ? 'next week' : `in ${forecastDays} days`;
  return `You'll remember ~${formatPercent(f.recall)} of string ${f.string} ${when}.`;
}

/** A cell's accessible name, e.g. "string 5, fret 7, E: stable for 12 days, slow". */
export function cellSummary(
  cell: HeatCell,
  tuning: Tuning = STANDARD_TUNING,
  pref: AccidentalPref = 'sharp',
): string {
  const base = cellLabel(cell, { tuning, pref, revealNote: true });
  if (cell.stabilityDays === null) return `${base}: not practised yet`;
  return `${base}: stable for ${formatDays(cell.stabilityDays)}${cell.slow ? ', slow' : ''}`;
}
