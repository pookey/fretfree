import { Rating, State, type Grade } from 'ts-fsrs';
import { ENGINE_CONFIG } from './config';
import {
  addDays,
  dayOfWeek,
  daysBetween,
  startOfLocalDay,
  toLocalDate,
  type LocalDate,
} from './gamification/local-date';
import { median } from './mastery';
import type { CardRecord, ReviewLogRecord } from './model';
import { isLearning, isStable, latestOutcomes } from './progress';
import type { Scheduler } from './scheduler';

/**
 * Progress over time (design §7 Progress, research/02 rule 15): what the
 * learner knows day by day, their speed per drill, their practice calendar
 * and the reviews coming up. Pure: the caller passes `today`/`now` and the
 * scheduler in.
 *
 * Only current cards are stored, so past days are rebuilt by replaying each
 * item's review log through FSRS. The replay uses today's FSRS weights, so
 * a past day is a close reconstruction rather than a record; today's point
 * always comes from the stored cards, so it matches the Topics panel.
 */

type Item = { id: string; skillId: string };

export interface ReplayDeps {
  scheduler: Pick<Scheduler, 'newCard' | 'review' | 'seedKnownCard'>;
  /** True for a placement-test log (`placement/save.ts`), which only seeds or nudges a card. */
  isPlacement(log: Pick<ReviewLogRecord, 'drillType'>): boolean;
}

/** One item's card after each review, and the outcome of each answer, oldest first. */
export interface ItemTimeline {
  itemId: string;
  states: { at: number; card: CardRecord }[];
  outcomes: { at: number; correct: boolean }[];
}

function byTime<T extends { at: Date }>(list: T[]): T[] {
  // Array#sort is stable, so logs at the same instant keep insertion order.
  return list.sort((a, b) => a.at.getTime() - b.at.getTime());
}

/**
 * Replay every item's history. A card the learner had before any session
 * answer (a placement test's "already known" seed) starts at the seed state
 * on the day it was created. A placement probe on an existing card reviews
 * it only if that moves it forward, as `probeReview` does.
 */
export function replayItems(
  cards: readonly CardRecord[],
  logs: readonly ReviewLogRecord[],
  deps: ReplayDeps,
): ItemTimeline[] {
  const logsOf = new Map<string, ReviewLogRecord[]>();
  for (const log of logs) {
    const list = logsOf.get(log.itemId) ?? [];
    list.push(log);
    logsOf.set(log.itemId, list);
  }
  const cardOf = new Map(cards.map((c) => [c.itemId, c]));
  const ids = new Set([...cardOf.keys(), ...logsOf.keys()]);
  const { scheduler, isPlacement } = deps;

  return [...ids].map((itemId) => {
    const card = cardOf.get(itemId);
    const itemLogs = byTime([...(logsOf.get(itemId) ?? [])]);
    const item: Item = { id: itemId, skillId: card?.skillId ?? itemLogs[0]?.skillId ?? '' };
    const firstSession = itemLogs.find((l) => !isPlacement(l));
    const states: ItemTimeline['states'] = [];
    let current: CardRecord | null = null;
    let seededAt = -Infinity;
    if (
      card &&
      card.fsrs.state !== State.New &&
      (!firstSession || firstSession.at.getTime() > card.createdAt.getTime())
    ) {
      seededAt = card.createdAt.getTime();
      current = scheduler.seedKnownCard(item, card.createdAt);
      states.push({ at: seededAt, card: current });
    }
    for (const log of itemLogs) {
      const at = log.at.getTime();
      if (isPlacement(log)) {
        if (!current || at < seededAt || log.rating < Rating.Good) continue;
        const next = scheduler.review(current, log.rating as Grade, log.at);
        const forward =
          next.fsrs.stability >= current.fsrs.stability &&
          next.fsrs.due.getTime() >= current.fsrs.due.getTime() &&
          next.fsrs.lapses <= current.fsrs.lapses;
        if (!forward) continue;
        current = next;
      } else {
        current = scheduler.review(
          current ?? scheduler.newCard(item, log.at),
          log.rating as Grade,
          log.at,
        );
      }
      states.push({ at, card: current });
    }
    const outcomes = itemLogs.map((l) => ({
      at: l.at.getTime(),
      correct: l.rating !== Rating.Again,
    }));
    return { itemId, states, outcomes };
  });
}

/** The last entry at or before `at`, by binary search on a time-sorted list. */
function lastAtOrBefore<T extends { at: number }>(list: readonly T[], at: number): T | undefined {
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((list[mid] as T).at <= at) lo = mid + 1;
    else hi = mid;
  }
  return list[lo - 1];
}

/** Every item's card as it was at `at`; items not yet met are left out. */
export function cardsAsOf(timelines: readonly ItemTimeline[], at: Date): CardRecord[] {
  const t = at.getTime();
  return timelines.flatMap((tl) => lastAtOrBefore(tl.states, t)?.card ?? []);
}

export interface KnownCounts {
  /** Items learning or stable: stable items count here too, as in `progressBySkill`. */
  learning: number;
  stable: number;
}

export interface KnownDay extends KnownCounts {
  date: LocalDate;
}

/** Learning and stable counts across `cards`, by `engine/progress`'s definitions. */
export function knownCounts(
  cards: readonly CardRecord[],
  outcomes: ReadonlyMap<string, boolean>,
  stabilityDays: number = ENGINE_CONFIG.mastery.stabilityDays,
): KnownCounts {
  let learning = 0;
  let stable = 0;
  for (const card of cards) {
    const s = isStable(card, stabilityDays);
    if (s) stable++;
    if (s || isLearning(card, outcomes.get(card.itemId))) learning++;
  }
  return { learning, stable };
}

/** The local date of the learner's first answer or card, or null before any. */
export function firstActiveDate(
  cards: readonly CardRecord[],
  logs: readonly ReviewLogRecord[],
): LocalDate | null {
  let first = Infinity;
  for (const log of logs) first = Math.min(first, log.at.getTime());
  for (const card of cards) {
    if (card.fsrs.state !== State.New) first = Math.min(first, card.createdAt.getTime());
  }
  return first === Infinity ? null : toLocalDate(new Date(first));
}

/** The last instant of a local date. */
export function endOfLocalDay(date: LocalDate): Date {
  return new Date(startOfLocalDay(addDays(date, 1)).getTime() - 1);
}

/**
 * Learning and stable counts at the end of each day from the first active
 * day to `today`. Today's counts are the stored cards', not the replay's.
 */
export function knownHistory(input: {
  cards: readonly CardRecord[];
  logs: readonly ReviewLogRecord[];
  timelines: readonly ItemTimeline[];
  today: LocalDate;
  stabilityDays?: number;
}): KnownDay[] {
  const { cards, logs, timelines, today } = input;
  const stabilityDays = input.stabilityDays ?? ENGINE_CONFIG.mastery.stabilityDays;
  const first = firstActiveDate(cards, logs);
  if (first === null || first > today) return [];
  const days: KnownDay[] = [];
  for (let date = first; date < today; date = addDays(date, 1)) {
    const end = endOfLocalDay(date).getTime();
    let learning = 0;
    let stable = 0;
    for (const tl of timelines) {
      const card = lastAtOrBefore(tl.states, end)?.card;
      if (!card) continue;
      const s = isStable(card, stabilityDays);
      if (s) stable++;
      if (s || isLearning(card, lastAtOrBefore(tl.outcomes, end)?.correct)) learning++;
    }
    days.push({ date, learning, stable });
  }
  days.push({ date: today, ...knownCounts(cards, latestOutcomes(logs), stabilityDays) });
  return days;
}

/** Answers that show recall speed: correct, unguided and not from the placement test. */
function timedAnswers(
  logs: readonly ReviewLogRecord[],
  isPlacement: ReplayDeps['isPlacement'],
): ReviewLogRecord[] {
  return logs.filter((l) => l.correct && !l.hintUsed && !isPlacement(l));
}

export interface SpeedDrill {
  drillType: string;
  answers: number;
  days: number;
}

/** Drills with timed answers, the most answered first. */
export function speedDrills(
  logs: readonly ReviewLogRecord[],
  isPlacement: ReplayDeps['isPlacement'],
): SpeedDrill[] {
  const byDrill = new Map<string, { answers: number; days: Set<LocalDate> }>();
  for (const log of timedAnswers(logs, isPlacement)) {
    const d = byDrill.get(log.drillType) ?? { answers: 0, days: new Set<LocalDate>() };
    d.answers++;
    d.days.add(toLocalDate(log.at));
    byDrill.set(log.drillType, d);
  }
  return [...byDrill]
    .map(([drillType, d]) => ({ drillType, answers: d.answers, days: d.days.size }))
    .sort((a, b) => b.answers - a.answers || a.drillType.localeCompare(b.drillType));
}

export interface SpeedDay {
  date: LocalDate;
  medianMs: number;
  answers: number;
}

/** The median time of one drill's timed answers on each day it was practised. */
export function speedByDay(
  logs: readonly ReviewLogRecord[],
  drillType: string,
  isPlacement: ReplayDeps['isPlacement'],
): SpeedDay[] {
  const byDay = new Map<LocalDate, number[]>();
  for (const log of timedAnswers(logs, isPlacement)) {
    if (log.drillType !== drillType) continue;
    const date = toLocalDate(log.at);
    const list = byDay.get(date) ?? [];
    list.push(log.responseMs);
    byDay.set(date, list);
  }
  return [...byDay]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, ms]) => ({ date, medianMs: median(ms) as number, answers: ms.length }));
}

/** The fields of a daily progress row the calendar reads. */
export interface PracticeDay {
  date: LocalDate;
  minutes: number;
  goalMet: boolean;
  freezeUsed: boolean;
}

export interface CalendarDay extends PracticeDay {
  /** After today: drawn as an empty slot. */
  future: boolean;
}

/** The Monday of the week holding `date`. */
export function weekStart(date: LocalDate): LocalDate {
  return addDays(date, -((dayOfWeek(date) + 6) % 7));
}

/**
 * Weeks of days, Monday first, oldest week first, ending with this week.
 * The calendar starts at the first practised week, within the min/max.
 */
export function practiceCalendar(
  days: readonly PracticeDay[],
  today: LocalDate,
  cfg: { calendarWeeks: number; calendarMinWeeks: number } = ENGINE_CONFIG.history,
): CalendarDay[][] {
  const byDate = new Map(days.map((d) => [d.date, d]));
  const thisWeek = weekStart(today);
  const practised = days.filter((d) => d.minutes > 0 || d.freezeUsed).map((d) => d.date);
  const first = practised.length
    ? weekStart(practised.reduce((a, b) => (a < b ? a : b)))
    : thisWeek;
  const weeksSince = Math.floor(daysBetween(first, thisWeek) / 7) + 1;
  const weeks = Math.max(cfg.calendarMinWeeks, Math.min(cfg.calendarWeeks, weeksSince));
  const start = addDays(thisWeek, -7 * (weeks - 1));
  return Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const date = addDays(start, w * 7 + d);
      const day = byDate.get(date);
      return {
        date,
        minutes: day?.minutes ?? 0,
        goalMet: day?.goalMet ?? false,
        freezeUsed: day?.freezeUsed ?? false,
        future: date > today,
      };
    }),
  );
}

export interface DueDay {
  date: LocalDate;
  due: number;
}

/** Reviews due on each of the next `days` days; anything overdue is due today. */
export function dueByDay(
  cards: readonly CardRecord[],
  now: Date,
  days: number = ENGINE_CONFIG.history.dueForecastDays,
): DueDay[] {
  const today = toLocalDate(now);
  const out = Array.from({ length: days }, (_, i) => ({ date: addDays(today, i), due: 0 }));
  for (const card of cards) {
    if (card.fsrs.state === State.New) continue;
    const date = toLocalDate(card.fsrs.due);
    const i = date <= today ? 0 : daysBetween(today, date);
    const slot = out[i];
    if (slot) slot.due++;
  }
  return out;
}

/** Mean predicted recall of every practised card `horizonDays` from now, or null with none. */
export function recallIfStopped(
  cards: readonly CardRecord[],
  now: Date,
  retrievability: (card: CardRecord, at: Date) => number,
  horizonDays: number = ENGINE_CONFIG.history.recallHorizonDays,
): number | null {
  const practised = cards.filter((c) => c.fsrs.state !== State.New);
  if (practised.length === 0) return null;
  const at = new Date(now.getTime() + horizonDays * 86_400_000);
  return practised.reduce((sum, c) => sum + retrievability(c, at), 0) / practised.length;
}
