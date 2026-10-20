import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Rating, State } from 'ts-fsrs';
import { ENGINE_CONFIG } from '../engine/config';
import { createScheduler } from '../engine/scheduler';
import type { ReviewLogRecord } from '../engine/model';
import clearDue from '../engine/gamification/quests/clear-due';
import fluent from '../engine/gamification/quests/fluent';
import newGround from '../engine/gamification/quests/new-ground';
import tryMic from '../engine/gamification/quests/try-mic';
import type { CardKind } from '../engine/gamification/types';
import { FretworkDB } from './db';
import { getDailyProgress, getEvents, logEvent, saveGamification } from './gamification-repo';
import {
  dueReviews,
  loadQuestDay,
  loadQuestInputs,
  loadQuestSnapshot,
  syncQuests,
} from './quests-sync';
import { getGamification, saveSettings } from './repository';

const DATE = '2026-10-18';
const now = new Date(2026, 9, 18, 18, 0);
let db: FretworkDB;
let n = 0;

beforeEach(async () => {
  db = new FretworkDB(`quests-sync-test-${n++}`);
  await db.open();
});

afterEach(async () => {
  await db.delete();
});

function log(at: Date, over: Partial<ReviewLogRecord> = {}): Omit<ReviewLogRecord, 'id'> {
  return {
    itemId: 'note@s6f5',
    skillId: 'F2.string6-naturals',
    drillType: 'name-the-note',
    correct: true,
    responseMs: 700,
    rating: Rating.Easy,
    hintUsed: false,
    answerGiven: 'A',
    at,
    ...over,
  };
}

/** One answer as the runner stores it: a review log and an `answer` event at the same instant. */
async function answered(at: Date, kind: CardKind, over: Partial<ReviewLogRecord> = {}) {
  const l = log(at, over);
  await db.reviewLogs.add(l);
  await logEvent(
    db,
    {
      type: 'answer',
      itemId: l.itemId,
      skillId: l.skillId,
      correct: l.correct,
      rating: Rating.Easy,
      kind,
      xp: 12,
    },
    at,
  );
}

const at = (day: number, hour: number, min = 0) => new Date(2026, 9, day, hour, min);

describe('loadQuestSnapshot', () => {
  it('reads the lookback days before the date only, oldest first', async () => {
    await db.reviewLogs.bulkAdd([
      log(at(17, 20)),
      log(at(3, 9)), // before the 14-day lookback
      log(at(4, 0)),
      log(at(18, 0)), // the date itself
    ]);
    const s = await loadQuestSnapshot(db, DATE);
    expect(s.date).toBe(DATE);
    expect(s.priorReviews.map((r) => r.at)).toEqual([at(4, 0), at(17, 20)]);
  });

  it('carries whether mic mode is on', async () => {
    expect((await loadQuestSnapshot(db, DATE)).micEnabled).toBe(false);
    await saveSettings(db, { micEnabled: true });
    expect((await loadQuestSnapshot(db, DATE)).micEnabled).toBe(true);
  });
});

describe('dueReviews', () => {
  it('counts graduated cards due by now, not learning steps', async () => {
    const scheduler = createScheduler();
    const item = { id: 'note@s6f5', skillId: 'F2.string6-naturals' };
    const learning = scheduler.review(scheduler.newCard(item, at(18, 9)), Rating.Good, at(18, 9));
    const review = { ...learning, itemId: 'note@s6f7' };
    review.fsrs = { ...learning.fsrs, state: State.Review, due: at(18, 10) };
    const later = { ...review, itemId: 'note@s6f8', fsrs: { ...review.fsrs, due: at(19, 10) } };
    await db.cards.bulkPut([
      { ...learning, fsrs: { ...learning.fsrs, due: at(18, 9, 10) } },
      review,
      later,
    ]);
    expect(await dueReviews(db, now)).toBe(1);
  });
});

describe('loadQuestDay', () => {
  it("joins the date's reviews with their XP kind", async () => {
    await answered(at(18, 9), 'new', { itemId: 'a', hintUsed: true, rating: Rating.Hard });
    await answered(at(18, 9, 1), 'due', { itemId: 'b' });
    await answered(at(17, 9), 'due', { itemId: 'yesterday' });
    // A review with no event, e.g. imported: never counted by a quest.
    await db.reviewLogs.add(log(at(18, 9, 2), { itemId: 'c' }));
    const ctx = await loadQuestDay(db, DATE, now);
    expect(ctx.answers.map((a) => [a.itemId, a.kind, a.guided])).toEqual([
      ['a', 'new', true],
      ['b', 'due', false],
      ['c', 'not-due', false],
    ]);
    expect(ctx.todaysReviews).toHaveLength(3);
    expect(ctx.dueRemaining).toBe(0);
    expect(ctx.date).toBe(DATE);
  });

  it('names the drill that asked each answer', async () => {
    await answered(at(18, 9), 'due', { itemId: 'a', drillType: 'play-the-note' });
    await answered(at(18, 9, 1), 'due', { itemId: 'b' });
    const ctx = await loadQuestDay(db, DATE, now);
    expect(ctx.answers.map((a) => a.drillType)).toEqual(['play-the-note', 'name-the-note']);
  });
});

describe('the mic quest', () => {
  const played = (min: number) =>
    answered(at(18, 9, min), 'due', { itemId: `find:A@s${min + 1}`, drillType: 'play-the-note' });

  it('is drawn in mic mode only, and completes on answers played into the mic', async () => {
    await db.reviewLogs.add(log(at(17, 9)));
    expect((await syncQuests(db, [tryMic], now)).statuses).toEqual([]);

    await saveSettings(db, { micEnabled: true });
    await played(0);
    await played(1);
    const partway = await syncQuests(db, [tryMic], now);
    expect(partway.statuses.map((x) => [x.quest.id, x.progress, x.done])).toEqual([
      ['try-mic', 2, false],
    ]);

    await played(2);
    const done = await syncQuests(db, [tryMic], now);
    expect(done.fresh).toEqual([
      {
        type: 'quest-completed',
        date: DATE,
        questId: 'try-mic',
        xp: ENGINE_CONFIG.quests['try-mic'].bonusXp,
      },
    ]);
  });
});

describe('syncQuests', () => {
  const templates = [clearDue, fluent, newGround];

  it('draws the quests and reports progress without awarding below target', async () => {
    await db.reviewLogs.add(log(at(17, 9)));
    await answered(at(18, 9), 'due', { itemId: 'x', rating: Rating.Good });
    // Something still due keeps clear-due open.
    await db.cards.put({
      itemId: 'z',
      skillId: 'F2.string6-naturals',
      fsrs: {
        ...createScheduler().newCard({ id: 'z', skillId: 's' }, now).fsrs,
        state: State.Review,
        due: at(18, 8),
      },
      createdAt: now,
      lastReviewedAt: now,
    });
    const s = await syncQuests(db, templates, now);
    expect(s.date).toBe(DATE);
    expect(s.fresh).toEqual([]);
    expect(s.statuses.map((x) => [x.quest.id, x.progress, x.done]).sort()).toEqual([
      ['clear-due', 0, false],
      ['fluent', 0, false],
      ['new-ground', 0, false],
    ]);
    expect(await getEvents(db, { type: 'quest-completed' })).toEqual([]);
  });

  it('awards a completed quest once, with bonus XP and a logged event', async () => {
    await saveGamification(db, { xpTotal: 50 });
    await db.reviewLogs.add(log(at(17, 9)));
    await answered(at(18, 9), 'due');

    const first = await syncQuests(db, templates, now);
    expect(first.fresh).toEqual([
      { type: 'quest-completed', date: DATE, questId: 'clear-due', xp: 20 },
    ]);
    expect(first.statuses.find((s) => s.quest.id === 'clear-due')?.done).toBe(true);
    expect((await getGamification(db)).xpTotal).toBe(70);
    const day = await getDailyProgress(db, DATE);
    expect(day).toMatchObject({ xp: 20, questsCompleted: ['clear-due'] });

    // Again, and concurrently: never paid twice.
    const inputs = await loadQuestInputs(db, now);
    const again = await Promise.all([
      syncQuests(db, templates, now, inputs),
      syncQuests(db, templates, now, inputs),
    ]);
    expect(again.flatMap((s) => s.fresh)).toEqual([]);
    expect((await getGamification(db)).xpTotal).toBe(70);
    const logged = await getEvents(db, { type: 'quest-completed' });
    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatchObject({ questId: 'clear-due', xp: 20, date: DATE, at: now });
  });
});
