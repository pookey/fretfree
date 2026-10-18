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
import { daysBetween, toLocalDate, type CardKind } from '../../engine/gamification';
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
  knownAfterGapDays: number;
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

/**
 * A competence statement. `reach`: every item on `string` from its lowest
 * fret up to `toFret` is known (recalled across a gap). `learned`: the same
 * run is learned but not yet recalled on a later day.
 */
export type CompetenceLine =
  | { kind: 'mastered'; skillId: string; skillTitle: string }
  | {
      kind: 'reach' | 'learned';
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

/** Learned: graduated to FSRS review with some stability. Can happen within one session. */
export function isLearned(card: CardRecord | undefined, cfg: CelebrationConfig): boolean {
  return (
    card !== undefined &&
    card.fsrs.state === State.Review &&
    card.fsrs.stability >= cfg.knownStabilityDays
  );
}

/**
 * Known: learned, and the last review that left it learned came at least
 * `knownAfterGapDays` local days after the item was introduced. That is
 * recall across a gap. A same-day block of reps can make a card learned (a
 * fast first answer is Easy), but never known.
 */
export function isKnown(card: CardRecord | undefined, cfg: CelebrationConfig): boolean {
  if (!isLearned(card, cfg) || !card?.lastReviewedAt) return false;
  const gap = daysBetween(toLocalDate(card.createdAt), toLocalDate(card.lastReviewedAt));
  return gap >= cfg.knownAfterGapDays;
}

interface Reach {
  /** Highest fret of the contiguous run from the lowest fret, or -1. */
  toFret: number;
  lastFret: number;
}

/** Per string, how far up the neck a skill's note items pass `test` without a gap. */
export function stringReach(skill: Skill, test: (itemId: string) => boolean): Map<number, Reach> {
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
      if (!test(id)) break;
      toFret = fret;
    }
    out.set(string, { toFret, lastFret: (list.at(-1) as { fret: number }).fret });
  }
  return out;
}

type ReachLine = Extract<CompetenceLine, { kind: 'reach' | 'learned' }>;

/** The furthest line per string, strings high to low. */
function furthestPerString(lines: readonly ReachLine[]): ReachLine[] {
  const furthest = new Map<number, ReachLine>();
  for (const line of lines) {
    const best = furthest.get(line.string);
    if (!best || line.toFret > best.toFret) furthest.set(line.string, line);
  }
  return [...furthest.values()].sort((a, b) => b.string - a.string);
}

/**
 * What the learner can newly claim: skills mastered this session, strings
 * whose known reach grew, then strings learned further today but not yet
 * recalled across a gap. A newly mastered skill is only celebrated as such
 * once enough of its items are known (the engine's mastery rule has no gap
 * requirement), and it replaces its own reach lines. Each string keeps its
 * furthest line, and a learned line is dropped where the known reach is as far.
 */
export function competenceGains(
  skills: readonly Skill[],
  before: Snapshot,
  after: Snapshot,
  cfg: CelebrationConfig,
): CompetenceLine[] {
  const mastered: CompetenceLine[] = [];
  const known: ReachLine[] = [];
  const learned: ReachLine[] = [];
  const test =
    (rule: typeof isKnown, snap: Snapshot) =>
    (id: string): boolean =>
      rule(snap.cards.get(id), cfg);
  for (const skill of [...skills].sort((a, b) => a.order - b.order)) {
    const items = skill.items();
    const knownShare =
      items.length === 0
        ? 0
        : items.filter((i) => isKnown(after.cards.get(i.id), cfg)).length / items.length;
    if (
      after.statuses.get(skill.id) === 'mastered' &&
      before.statuses.get(skill.id) !== 'mastered' &&
      knownShare >= ENGINE_CONFIG.mastery.itemShare
    ) {
      mastered.push({ kind: 'mastered', skillId: skill.id, skillTitle: skill.title });
      continue;
    }
    const knownWas = stringReach(skill, test(isKnown, before));
    const learnedWas = stringReach(skill, test(isLearned, before));
    const learnedNow = stringReach(skill, test(isLearned, after));
    for (const [string, now] of stringReach(skill, test(isKnown, after))) {
      const line = { skillId: skill.id, skillTitle: skill.title, string };
      if (now.toFret > (knownWas.get(string)?.toFret ?? -1)) {
        known.push({
          ...line,
          kind: 'reach',
          toFret: now.toFret,
          complete: now.toFret === now.lastFret,
        });
      }
      const l = learnedNow.get(string) as Reach;
      if (l.toFret > Math.max(learnedWas.get(string)?.toFret ?? -1, now.toFret)) {
        learned.push({
          ...line,
          kind: 'learned',
          toFret: l.toFret,
          complete: l.toFret === l.lastFret,
        });
      }
    }
  }
  const knownLines = furthestPerString(known);
  const reach = new Map(knownLines.map((l) => [l.string, l.toFret]));
  const learnedLines = furthestPerString(learned).filter(
    (l) => l.toFret > (reach.get(l.string) ?? -1),
  );
  return [...mastered, ...knownLines, ...learnedLines];
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
 * `minAnswers` correct unguided answers don't qualify. One sort and a linear
 * merge of reviews against session starts.
 */
export function bestPastSpeedMs(
  sessionStarts: readonly Date[],
  reviews: readonly ReviewLogRecord[],
  minAnswers: number,
): number | null {
  const starts = sessionStarts.map((d) => d.getTime()).sort((a, b) => a - b);
  const sorted = [...reviews].sort((a, b) => a.at.getTime() - b.at.getTime());
  let best: number | null = null;
  let session = -1;
  let current: Pick<TalliedAnswer, 'correct' | 'guided' | 'responseMs'>[] = [];
  const close = () => {
    const ms = sessionSpeedMs(current, minAnswers);
    if (ms !== null && (best === null || ms < best)) best = ms;
    current = [];
  };
  for (const review of sorted) {
    const at = review.at.getTime();
    let next = session;
    while (next + 1 < starts.length && (starts[next + 1] as number) <= at) next++;
    if (next !== session) {
      close();
      session = next;
    }
    if (session < 0) continue;
    current.push({
      correct: review.correct,
      guided: review.hintUsed,
      responseMs: review.responseMs,
    });
  }
  close();
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
