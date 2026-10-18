import { State, type Grade } from 'ts-fsrs';
import {
  ENGINE_CONFIG,
  type CardRecord,
  type EntryKind,
  type Scheduler,
  type SessionEntry,
} from '../engine';
import {
  applyDay,
  datesToSettle,
  emptyDailyProgress,
  toLocalDate,
  xpForAnswer,
  type CardKind,
  type DailyProgressRecord,
  type GamificationEvent,
  type GamificationRecord,
  type LocalDate,
} from '../engine/gamification';
import { commitGamification, getGamification, type FretworkDB } from '../storage';
import { isPlacementLog } from '../placement/save';

/**
 * The bridge between a practice session and the gamification engine (design
 * §3.7 engine wiring). Each answer earns XP and adds its minutes to today's
 * `DailyProgress`, flipping `goalMet` once the daily goal is reached. The
 * streak is settled at session finish and on app open, following the caller
 * contract in the `applyDay` doc comment. Every event is logged.
 *
 * Gamification decides how much and how often, never what: the session
 * builder still picks the items. `stretchEntries` only tops up a session whose
 * due and new queue ran dry, and never with a stable card that is not due.
 */

// --- Pure ----------------------------------------------------------------

/** The XP kind of a planned entry. A retry takes its item's earlier kind. */
export function xpKindOf(kind: Exclude<EntryKind, 'retry'>): CardKind {
  return kind === 'review' ? 'due' : kind;
}

/**
 * Minutes between two moments that count toward the daily goal. A gap longer
 * than `maxGapSeconds` (the learner walked away) counts only up to it.
 */
export function countedMinutes(
  from: Date,
  to: Date,
  maxGapSeconds: number = ENGINE_CONFIG.gamification.daily.maxGapSeconds,
): number {
  const ms = Math.min(Math.max(0, to.getTime() - from.getTime()), maxGapSeconds * 1000);
  return ms / 60_000;
}

export interface StretchInput {
  cards: readonly CardRecord[];
  /** Skills on the frontier (unlocked or practising). */
  frontierSkills: ReadonlySet<string>;
  /** Items already in the plan. */
  planned: ReadonlySet<string>;
  scheduler: Scheduler;
  now: Date;
  /** Slots left to fill. */
  count: number;
  /** A card this stable (in days) is stable, so it is never a stretch item. */
  stableDays?: number;
}

/**
 * Stretch items to top up a session whose due and new queue ran dry (§3.7):
 * reviewed, not-yet-stable cards of frontier skills that are not due yet.
 * Each is used once, weakest (lowest retrievability) first, interleaved
 * round-robin across skills. Unseen items are left out: they need a guided
 * new block (research/02 rule 8). Stable cards are left out, so meeting the
 * daily goal never needs drilling them (rule 15).
 */
export function stretchEntries(input: StretchInput): SessionEntry[] {
  const stableDays = input.stableDays ?? ENGINE_CONFIG.mastery.stabilityDays;
  if (input.count <= 0) return [];
  const ranked = input.cards
    .filter(
      (c) =>
        input.frontierSkills.has(c.skillId) &&
        !input.planned.has(c.itemId) &&
        c.fsrs.state !== State.New &&
        c.fsrs.stability < stableDays &&
        !input.scheduler.isDue(c, input.now),
    )
    .map((c) => ({ c, r: input.scheduler.retrievability(c, input.now) }))
    .sort((a, b) => a.r - b.r || a.c.itemId.localeCompare(b.c.itemId))
    .map(({ c }) => c);

  // Skills in order of their weakest card; each skill's cards weakest first.
  const bySkill = new Map<string, CardRecord[]>();
  for (const c of ranked) bySkill.set(c.skillId, [...(bySkill.get(c.skillId) ?? []), c]);
  const queues = [...bySkill.values()];
  const out: SessionEntry[] = [];
  for (let round = 0; out.length < input.count; round++) {
    const picked = queues.flatMap((q) => q[round] ?? []);
    if (picked.length === 0) break;
    for (const c of picked.slice(0, input.count - out.length)) {
      out.push({ itemId: c.itemId, skillId: c.skillId, kind: 'stretch', guided: false });
    }
  }
  return out;
}

// --- Persistence -----------------------------------------------------------

const tables = (db: FretworkDB) => [db.gamification, db.dailyProgress, db.gamificationEvents];

/**
 * Earlier answers to `itemId` on the learner's local date of `at`: guided
 * new-block reps, retries and reappearances all count, so XP decays as
 * `xpForAnswer` intends. Placement-test probes don't count: trying the test
 * mustn't cost XP (§3.7). Call it before the answer itself is recorded.
 */
export async function answersToday(db: FretworkDB, itemId: string, at: Date): Promise<number> {
  const today = toLocalDate(at);
  return db.reviewLogs
    .where('itemId')
    .equals(itemId)
    .filter((l) => toLocalDate(l.at) === today && !isPlacementLog(l))
    .count();
}

interface Accrual {
  state: GamificationRecord;
  day: DailyProgressRecord;
  /** The goal was reached by this accrual. */
  goalReached: boolean;
  events: GamificationEvent[];
}

/**
 * Add XP and minutes to the total and to today's progress, flip `goalMet`
 * (logging `goal-met` once per date) and commit with `events`. Runs inside
 * the caller's transaction.
 */
async function accrue(
  db: FretworkDB,
  add: { xp: number; minutes: number; at: Date },
  events: GamificationEvent[],
): Promise<Accrual> {
  const date = toLocalDate(add.at);
  const [g, stored] = await Promise.all([getGamification(db), db.dailyProgress.get(date)]);
  const row = stored ?? emptyDailyProgress(date);
  const state = { ...g, xpTotal: g.xpTotal + add.xp };
  const day = { ...row, xp: row.xp + add.xp, minutes: row.minutes + add.minutes };
  const goalReached = !row.goalMet && day.minutes >= state.dailyGoalMinutes;
  const all = [...events];
  if (goalReached) {
    day.goalMet = true;
    all.push({ type: 'goal-met', date, minutes: day.minutes, xp: day.xp });
  }
  await commitGamification(db, { state, days: [day], events: all, at: add.at });
  return { state, day, goalReached, events: all };
}

export interface AnswerProgressInput {
  itemId: string;
  skillId: string;
  correct: boolean;
  rating: Grade;
  kind: CardKind;
  /** FSRS stability before this answer, in days (0 for a new card). */
  stabilityDays: number;
  /** From `answersToday`, counted before this answer was recorded. */
  answeredToday: number;
  /** Session minutes since the last answer, from `countedMinutes`. */
  minutes: number;
  at: Date;
}

export interface AnswerProgress {
  xp: number;
  day: DailyProgressRecord;
  /** This answer reached today's goal. */
  goalReached: boolean;
}

/**
 * Award XP for one answer and log it as an `answer` event carrying that XP
 * (research/02 rule 17), adding its minutes to today's progress.
 */
export async function addAnswerProgress(
  db: FretworkDB,
  input: AnswerProgressInput,
): Promise<AnswerProgress> {
  const xp = xpForAnswer(input);
  const { itemId, skillId, correct, rating, kind } = input;
  const event: GamificationEvent = { type: 'answer', itemId, skillId, correct, rating, kind, xp };
  return db.transaction('rw', tables(db), async () => {
    const { day, goalReached } = await accrue(db, { xp, minutes: input.minutes, at: input.at }, [
      event,
    ]);
    return { xp, day, goalReached };
  });
}

interface Settled {
  state: GamificationRecord;
  days: DailyProgressRecord[];
  events: GamificationEvent[];
}

/**
 * The caller side of `applyDay`: settle every date of `datesToSettle` in
 * order with its stored row, then today only if its goal is met (a re-settle
 * lets a repair fire mid-day). Never settles today with `goalMet: false`.
 */
async function settle(db: FretworkDB, today: LocalDate): Promise<Settled> {
  let state = await getGamification(db);
  const days: DailyProgressRecord[] = [];
  const events: GamificationEvent[] = [];
  const step = (day: DailyProgressRecord | undefined, date: LocalDate) => {
    const r = applyDay(state, day, date);
    state = r.state;
    days.push(r.day);
    events.push(...r.events);
  };
  for (const date of datesToSettle(state, today)) step(await db.dailyProgress.get(date), date);
  const todays = await db.dailyProgress.get(today);
  if (todays?.goalMet) step(todays, today);
  return { state, days, events };
}

export interface SettleResult {
  state: GamificationRecord;
  events: GamificationEvent[];
}

/**
 * Settle the streak up to the local date of `now` and store the state, every
 * settled day (a dropped `freezeUsed` row would burn a second freeze on the
 * next open) and every event, atomically. Idempotent: safe on every app open.
 */
export async function settleStreak(db: FretworkDB, now: Date): Promise<SettleResult> {
  return db.transaction('rw', tables(db), async () => {
    const { state, days, events } = await settle(db, toLocalDate(now));
    await commitGamification(db, { state, days, events, at: now });
    return { state, events };
  });
}

export interface SessionProgressInput {
  /** The `sessionLogs` row. */
  sessionId?: number;
  at: Date;
  /** Minutes since the last answer, still to add to today. */
  minutes: number;
  /** Every counted minute of the session, including `minutes`. */
  sessionMinutes: number;
  xp: number;
  itemsSeen: number;
  accuracy: number;
}

export interface SessionProgress {
  state: GamificationRecord;
  /** The trailing minutes reached today's goal. */
  goalReached: boolean;
  goalMet: boolean;
  /** Logged at finish: `goal-met` if reached now, `session-complete`, then the streak's. */
  events: GamificationEvent[];
}

/**
 * Close a session: add its trailing minutes, log `session-complete` and
 * settle the streak, all in one transaction.
 */
export async function finishSessionProgress(
  db: FretworkDB,
  input: SessionProgressInput,
): Promise<SessionProgress> {
  return db.transaction('rw', tables(db), async () => {
    const acc = await accrue(db, { xp: 0, minutes: input.minutes, at: input.at }, []);
    const complete: GamificationEvent = {
      type: 'session-complete',
      date: acc.day.date,
      ...(input.sessionId !== undefined && { sessionId: input.sessionId }),
      xp: input.xp,
      minutes: input.sessionMinutes,
      itemsSeen: input.itemsSeen,
      accuracy: input.accuracy,
    };
    const { state, days, events } = await settle(db, acc.day.date);
    await commitGamification(db, { state, days, events: [complete, ...events], at: input.at });
    return {
      state,
      goalReached: acc.goalReached,
      goalMet: acc.day.goalMet,
      events: [...acc.events, complete, ...events],
    };
  });
}

/**
 * Settle the streak now and whenever the app comes back to the foreground, so
 * a learner who missed days never sees a stale streak (an installed PWA can
 * stay alive in the background for days). Returns a cleanup function.
 */
export function installStreakSettle(
  db: FretworkDB,
  now: () => Date = () => new Date(),
  doc: Document = document,
): () => void {
  const run = () => {
    settleStreak(db, now()).catch((e: unknown) => console.error('Streak settle failed', e));
  };
  const onVisible = () => {
    if (doc.visibilityState === 'visible') run();
  };
  run();
  doc.addEventListener('visibilitychange', onVisible);
  return () => doc.removeEventListener('visibilitychange', onVisible);
}
