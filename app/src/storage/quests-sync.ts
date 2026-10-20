import { State } from 'ts-fsrs';
import { ENGINE_CONFIG } from '../engine/config';
import {
  addDays,
  startOfLocalDay,
  toLocalDate,
  type LocalDate,
} from '../engine/gamification/local-date';
import {
  completeQuests,
  drawQuests,
  questStatuses,
  type QuestAnswer,
  type QuestDayContext,
  type QuestSnapshot,
  type QuestStatus,
  type QuestTemplate,
} from '../engine/gamification/quests';
import type { AnswerEvent, QuestCompletedEvent } from '../engine/gamification/types';
import type { FretworkDB } from './db';
import { commitGamification, getDailyProgress } from './gamification-repo';
import { getGamification, getSettings, getSkillStates } from './repository';

/**
 * Glue between the stored data and the pure quest functions (design §3.7
 * daily quests): load the day's history and answers, draw the quests, and
 * persist any newly completed ones with their bonus XP.
 */

/** Reviews in `[from, to)`, oldest first. */
async function reviewsBetween(db: FretworkDB, from: Date, to: Date) {
  return db.reviewLogs.where('at').between(from, to, true, false).sortBy('at');
}

/**
 * The history a date's quests are drawn from: the lookback days before it,
 * and whether mic mode is on (a mic quest is drawn only then).
 */
export async function loadQuestSnapshot(
  db: FretworkDB,
  date: LocalDate,
  lookbackDays: number = ENGINE_CONFIG.quests.lookbackDays,
): Promise<QuestSnapshot> {
  const from = startOfLocalDay(addDays(date, -lookbackDays));
  const [priorReviews, settings] = await Promise.all([
    reviewsBetween(db, from, startOfLocalDay(date)),
    getSettings(db),
  ]);
  return { date, priorReviews, micEnabled: settings.micEnabled };
}

/**
 * Graduated reviews due by `now`. Cards in a learning or relearning step are
 * left out: they come due minutes after a session, so counting them would
 * keep "clear your due reviews" out of reach however much you practise.
 */
export async function dueReviews(db: FretworkDB, now: Date): Promise<number> {
  return db.cards
    .where('fsrs.due')
    .belowOrEqual(now)
    .filter((c) => c.fsrs.state === State.Review)
    .count();
}

/**
 * Everything a date's quests measure progress against. Each review log is
 * joined with the `answer` event logged in the same transaction (same item,
 * same instant) for its XP kind. A review with no event (e.g. imported from
 * an older export) counts as `not-due`, which no quest counts.
 */
export async function loadQuestDay(
  db: FretworkDB,
  date: LocalDate,
  now: Date,
): Promise<QuestDayContext> {
  const from = startOfLocalDay(date);
  const to = startOfLocalDay(addDays(date, 1));
  const [todaysReviews, events, dueRemaining, skillStates] = await Promise.all([
    reviewsBetween(db, from, to),
    db.gamificationEvents
      .where('at')
      .between(from, to, true, false)
      .filter((e) => e.type === 'answer')
      .toArray(),
    dueReviews(db, now),
    getSkillStates(db),
  ]);
  const kinds = new Map(
    events.map((e) => {
      const { itemId, kind } = e.data as Pick<AnswerEvent, 'itemId' | 'kind'>;
      return [`${itemId}@${e.at.getTime()}`, kind];
    }),
  );
  const answers: QuestAnswer[] = todaysReviews.map((r) => ({
    itemId: r.itemId,
    skillId: r.skillId,
    correct: r.correct,
    rating: r.rating as QuestAnswer['rating'],
    kind: kinds.get(`${r.itemId}@${r.at.getTime()}`) ?? 'not-due',
    guided: r.hintUsed,
    at: r.at,
    drillType: r.drillType,
    answerGiven: r.answerGiven,
  }));
  return { date, todaysReviews, dueRemaining, skillStates, answers };
}

export interface QuestInputs {
  snapshot: QuestSnapshot;
  ctx: QuestDayContext;
}

/** Everything `syncQuests` needs for the local date of `now`. Read-only, so it can be watched. */
export async function loadQuestInputs(db: FretworkDB, now: Date): Promise<QuestInputs> {
  const date = toLocalDate(now);
  const [snapshot, ctx] = await Promise.all([
    loadQuestSnapshot(db, date),
    loadQuestDay(db, date, now),
  ]);
  return { snapshot, ctx };
}

export interface QuestSync {
  date: LocalDate;
  statuses: QuestStatus[];
  /** Quests completed by this call, each logged with its bonus XP. */
  fresh: QuestCompletedEvent[];
}

/**
 * Draw the date's quests, award every one that has newly reached its target
 * (bonus XP to the total and the day, plus a logged `quest-completed` event),
 * and return each quest's status. Safe to call repeatedly or concurrently:
 * the day is re-read inside the transaction, so a quest never pays twice.
 */
export async function syncQuests(
  db: FretworkDB,
  templates: readonly QuestTemplate[],
  at: Date,
  inputs?: QuestInputs,
): Promise<QuestSync> {
  const { snapshot, ctx } = inputs ?? (await loadQuestInputs(db, at));
  const quests = drawQuests(snapshot, templates);
  const { day, events } = await db.transaction(
    'rw',
    [db.gamification, db.dailyProgress, db.gamificationEvents],
    async () => {
      const [state, stored] = await Promise.all([
        getGamification(db),
        getDailyProgress(db, ctx.date),
      ]);
      const done = completeQuests(state, stored, quests, ctx);
      if (done.events.length > 0) {
        await commitGamification(db, {
          state: done.state,
          days: [done.day],
          events: done.events,
          at,
        });
      }
      return done;
    },
  );
  return {
    date: ctx.date,
    statuses: questStatuses(quests, ctx, day.questsCompleted),
    fresh: events,
  };
}
