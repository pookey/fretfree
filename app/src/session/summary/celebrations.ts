import { State, type Grade } from 'ts-fsrs';
import {
  ENGINE_CONFIG,
  median,
  parseNoteItemId,
  type CardRecord,
  type EntryKind,
  type ReviewLogRecord,
  type Skill,
  type SkillStatus,
} from '../../engine';
import type { CardKind } from '../../engine/gamification';
import type { SessionSummary } from '../runner';

/**
 * Session celebrations (design §3.7, §3.3 step 5). Pure: everything is
 * computed from what the session answered and from card and skill snapshots
 * taken before and after it. The copy celebrates competence ("you now know
 * string 6 to fret 12"), not activity.
 */

export interface CelebrationConfig {
  comboShowAt: number;
  perfectMinAnswers: number;
  speedMinAnswers: number;
  knownStabilityDays: number;
}

/** One graded answer, as the summary needs it. */
export interface TalliedAnswer {
  itemId: string;
  skillId: string;
  kind: EntryKind;
  /** A worked-example rep with full guides: not evidence of recall. */
  guided: boolean;
  correct: boolean;
  rating: Grade;
  responseMs: number;
}

/** Cards and skill statuses at one moment. */
export interface Snapshot {
  cards: ReadonlyMap<string, CardRecord>;
  statuses: ReadonlyMap<string, SkillStatus>;
}

/** A competence statement. `reach`: every item on `string` from its lowest fret up to `toFret` is known. */
export type CompetenceLine =
  | { kind: 'mastered'; skillId: string; skillTitle: string }
  | {
      kind: 'reach';
      skillId: string;
      skillTitle: string;
      string: number;
      toFret: number;
      /** The reach covers every item the skill has on this string. */
      complete: boolean;
    };

export interface PersonalBest {
  medianMs: number;
  previousMs: number;
}

export interface Celebration {
  answered: number;
  accuracy: number;
  newItems: number;
  xp: number;
  itemsImproved: number;
  bestCombo: number;
  perfect: boolean;
  personalBest: PersonalBest | null;
  competence: CompetenceLine[];
  /** Other milestone copy, e.g. a streak milestone or an achievement. */
  milestones: string[];
  /** Fire confetti: only for milestones, never for activity alone. */
  confetti: boolean;
}

// --- Combo ---------------------------------------------------------------

/**
 * The combo after one more answer. A correct unguided answer counts up and a
 * miss resets it. A guided rep leaves it alone: the label was on the neck.
 */
export function nextCombo(
  combo: number,
  answer: Pick<TalliedAnswer, 'correct' | 'guided'>,
): number {
  if (!answer.correct) return 0;
  return answer.guided ? combo : combo + 1;
}

// --- XP ------------------------------------------------------------------

/**
 * The XP kind of a session entry. The builder only schedules due reviews, so
 * `review` is `due`. A `retry` re-asks a missed item; its earlier answer
 * today already lowers its XP through the repeat decay.
 */
export function xpKind(kind: EntryKind): CardKind {
  return kind === 'new' ? 'new' : 'due';
}

// --- Items improved ------------------------------------------------------

/** The last answer per item, in answer order. */
function lastAnswers(answers: readonly TalliedAnswer[]): Map<string, TalliedAnswer> {
  return new Map(answers.map((a) => [a.itemId, a]));
}

/**
 * Items whose FSRS stability rose this session and whose last answer was
 * correct. A miss that was later retried correctly usually still lowers
 * stability, so it doesn't count: the summary stays honest.
 */
export function improvedItems(
  before: ReadonlyMap<string, CardRecord>,
  after: ReadonlyMap<string, CardRecord>,
  answers: readonly TalliedAnswer[],
): string[] {
  const out: string[] = [];
  for (const [itemId, last] of lastAnswers(answers)) {
    const card = after.get(itemId);
    if (!last.correct || !card) continue;
    if (card.fsrs.stability > (before.get(itemId)?.fsrs.stability ?? 0)) out.push(itemId);
  }
  return out;
}

// --- Competence ----------------------------------------------------------

/** Known: graduated to FSRS review with some stability, i.e. recalled across a gap. */
export function isKnown(card: CardRecord | undefined, cfg: CelebrationConfig): boolean {
  return (
    card !== undefined &&
    card.fsrs.state === State.Review &&
    card.fsrs.stability >= cfg.knownStabilityDays
  );
}

interface Reach {
  /** Highest fret of the contiguous known run from the lowest fret, or -1. */
  toFret: number;
  lastFret: number;
}

/** Per string, how far up the neck a skill's note items are known without a gap. */
export function stringReach(skill: Skill, known: (itemId: string) => boolean): Map<number, Reach> {
  const byString = new Map<number, { fret: number; id: string }[]>();
  for (const item of skill.items()) {
    const pos = parseNoteItemId(item.id);
    if (!pos) continue;
    const list = byString.get(pos.string) ?? [];
    list.push({ fret: pos.fret, id: item.id });
    byString.set(pos.string, list);
  }
  const out = new Map<number, Reach>();
  for (const [string, list] of byString) {
    list.sort((a, b) => a.fret - b.fret);
    let toFret = -1;
    for (const { fret, id } of list) {
      if (!known(id)) break;
      toFret = fret;
    }
    out.set(string, { toFret, lastFret: (list.at(-1) as { fret: number }).fret });
  }
  return out;
}

/**
 * What the learner can newly claim to know: skills mastered this session,
 * and strings whose known reach grew. A newly mastered skill replaces its own
 * reach lines, and each string keeps only its furthest reach.
 */
export function competenceGains(
  skills: readonly Skill[],
  before: Snapshot,
  after: Snapshot,
  cfg: CelebrationConfig,
): CompetenceLine[] {
  const mastered: CompetenceLine[] = [];
  const reach: Extract<CompetenceLine, { kind: 'reach' }>[] = [];
  const knownBefore = (id: string) => isKnown(before.cards.get(id), cfg);
  const knownAfter = (id: string) => isKnown(after.cards.get(id), cfg);
  for (const skill of [...skills].sort((a, b) => a.order - b.order)) {
    if (
      after.statuses.get(skill.id) === 'mastered' &&
      before.statuses.get(skill.id) !== 'mastered'
    ) {
      mastered.push({ kind: 'mastered', skillId: skill.id, skillTitle: skill.title });
      continue;
    }
    const was = stringReach(skill, knownBefore);
    for (const [string, now] of stringReach(skill, knownAfter)) {
      if (now.toFret <= (was.get(string)?.toFret ?? -1)) continue;
      reach.push({
        kind: 'reach',
        skillId: skill.id,
        skillTitle: skill.title,
        string,
        toFret: now.toFret,
        complete: now.toFret === now.lastFret,
      });
    }
  }
  const furthest = new Map<number, (typeof reach)[number]>();
  for (const line of reach) {
    const best = furthest.get(line.string);
    if (!best || line.toFret > best.toFret) furthest.set(line.string, line);
  }
  return [...mastered, ...[...furthest.values()].sort((a, b) => b.string - a.string)];
}

// --- Speed ---------------------------------------------------------------

/** Median response time of correct, unguided answers, or null below `minAnswers`. */
export function sessionSpeedMs(
  answers: readonly Pick<TalliedAnswer, 'correct' | 'guided' | 'responseMs'>[],
  minAnswers: number,
): number | null {
  const times = answers.filter((a) => a.correct && !a.guided).map((a) => a.responseMs);
  return times.length >= minAnswers ? median(times) : null;
}

/**
 * The best (lowest) median speed of earlier sessions. Each review belongs to
 * the latest session that started at or before it; sessions with fewer than
 * `minAnswers` correct unguided answers don't qualify.
 */
export function bestPastSpeedMs(
  sessionStarts: readonly Date[],
  reviews: readonly ReviewLogRecord[],
  minAnswers: number,
): number | null {
  const starts = sessionStarts.map((d) => d.getTime()).sort((a, b) => a - b);
  const bySession = new Map<number, ReviewLogRecord[]>();
  for (const review of reviews) {
    const at = review.at.getTime();
    let session = -1;
    for (const start of starts) {
      if (start > at) break;
      session = start;
    }
    if (session < 0) continue;
    const list = bySession.get(session) ?? [];
    list.push(review);
    bySession.set(session, list);
  }
  let best: number | null = null;
  for (const list of bySession.values()) {
    const ms = sessionSpeedMs(
      list.map((r) => ({ correct: r.correct, guided: r.hintUsed, responseMs: r.responseMs })),
      minAnswers,
    );
    if (ms !== null && (best === null || ms < best)) best = ms;
  }
  return best;
}

// --- Perfect -------------------------------------------------------------

/** Every answer correct, over enough unguided answers to mean something. */
export function isPerfect(answers: readonly TalliedAnswer[], minAnswers: number): boolean {
  return answers.every((a) => a.correct) && answers.filter((a) => !a.guided).length >= minAnswers;
}

// --- Putting it together -------------------------------------------------

export interface CelebrationInput {
  summary: Pick<SessionSummary, 'itemsSeen' | 'accuracy' | 'newItems'>;
  answers: readonly TalliedAnswer[];
  xp: number;
  bestCombo: number;
  skills: readonly Skill[];
  before: Snapshot;
  after: Snapshot;
  /** Best median speed of earlier sessions (`bestPastSpeedMs`). */
  previousBestMs: number | null;
  /** Milestones decided elsewhere (streaks, achievements). */
  milestones?: readonly string[];
  config?: CelebrationConfig;
}

export function buildCelebration(input: CelebrationInput): Celebration {
  const cfg = input.config ?? ENGINE_CONFIG.gamification.celebrations;
  const competence = competenceGains(input.skills, input.before, input.after, cfg);
  const speed = sessionSpeedMs(input.answers, cfg.speedMinAnswers);
  const personalBest =
    speed !== null && input.previousBestMs !== null && speed < input.previousBestMs
      ? { medianMs: speed, previousMs: input.previousBestMs }
      : null;
  const milestones = [...(input.milestones ?? [])];
  return {
    answered: input.summary.itemsSeen,
    accuracy: input.summary.accuracy,
    newItems: input.summary.newItems,
    xp: input.xp,
    itemsImproved: improvedItems(input.before.cards, input.after.cards, input.answers).length,
    bestCombo: input.bestCombo,
    perfect: isPerfect(input.answers, cfg.perfectMinAnswers),
    personalBest,
    competence,
    milestones,
    confetti:
      milestones.length > 0 ||
      competence.some((c) => c.kind === 'mastered' || (c.kind === 'reach' && c.complete)),
  };
}
