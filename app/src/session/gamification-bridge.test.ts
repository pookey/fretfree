import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Rating } from 'ts-fsrs';
import { createScheduler, type CardRecord } from '../engine';
import {
  FretworkDB,
  getDailyProgress,
  getEvents,
  getGamification,
  saveDailyProgress,
  saveGamification,
} from '../storage';
import {
  addAnswerProgress,
  answersToday,
  countedMinutes,
  finishSessionProgress,
  installStreakSettle,
  settleStreak,
  stretchEntries,
  xpKindOf,
  type AnswerProgressInput,
} from './gamification-bridge';

const scheduler = createScheduler({ enableFuzz: false });
/** Local-time dates, so the learner's calendar day is what the test says. */
const at = (day: number, hour = 9, minute = 0) => new Date(2026, 9, day, hour, minute);
const DAY = 86_400_000;

let db: FretworkDB;
let n = 0;

beforeEach(() => {
  db = new FretworkDB(`bridge-${n++}`);
});

afterEach(async () => {
  await db.delete();
});

describe('xpKindOf', () => {
  it('maps planned entries to XP kinds', () => {
    expect(xpKindOf('new')).toBe('new');
    expect(xpKindOf('review')).toBe('due');
    expect(xpKindOf('stretch')).toBe('stretch');
  });
});

describe('countedMinutes', () => {
  it('counts the gap between answers in minutes', () => {
    expect(countedMinutes(at(18, 9, 0), at(18, 9, 0))).toBe(0);
    expect(countedMinutes(new Date(0), new Date(30_000))).toBe(0.5);
  });

  it('caps an idle gap and ignores a clock going backwards', () => {
    expect(countedMinutes(at(18, 9, 0), at(18, 10, 0))).toBe(1);
    expect(countedMinutes(at(18, 9, 0), at(18, 10, 0), 120)).toBe(2);
    expect(countedMinutes(at(18, 10, 0), at(18, 9, 0))).toBe(0);
  });
});

describe('stretchEntries', () => {
  const now = at(18);
  const card = (id: string, skillId: string, stability: number, ageDays = 1): CardRecord =>
    scheduler.seedKnownCard({ id, skillId }, new Date(now.getTime() - ageDays * DAY), stability);
  const input = (cards: CardRecord[], over: Partial<Parameters<typeof stretchEntries>[0]> = {}) =>
    stretchEntries({
      cards,
      frontierSkills: new Set(['a', 'b']),
      planned: new Set(),
      scheduler,
      now,
      count: 10,
      ...over,
    });

  it('tops up with not-due, not-yet-stable frontier cards, weakest first', () => {
    const cards = [
      card('a1', 'a', 3, 1),
      card('a2', 'a', 3, 2), // reviewed longer ago: weaker
      card('a3', 'a', 30), // stable: never a stretch item
      card('a4', 'a', 1, 2), // due
      card('c1', 'c', 2), // not a frontier skill
      { ...scheduler.newCard({ id: 'a5', skillId: 'a' }, now) }, // unseen: needs a guided block
    ];
    const out = input(cards);
    expect(out.map((e) => e.itemId)).toEqual(['a2', 'a1']);
    expect(out.every((e) => e.kind === 'stretch' && !e.guided)).toBe(true);
  });

  it('skips planned items and honours a custom stable threshold', () => {
    const cards = [card('a1', 'a', 3), card('a2', 'a', 5)];
    expect(input(cards, { planned: new Set(['a1']) }).map((e) => e.itemId)).toEqual(['a2']);
    expect(input(cards, { stableDays: 4 }).map((e) => e.itemId)).toEqual(['a1']);
  });

  it('interleaves skills round-robin and stops at the slot count', () => {
    const cards = [
      card('a1', 'a', 3, 2),
      card('a2', 'a', 3, 1),
      card('a3', 'a', 4, 1),
      card('b1', 'b', 3, 1.5),
    ];
    expect(input(cards).map((e) => e.itemId)).toEqual(['a1', 'b1', 'a2', 'a3']);
    expect(input(cards, { count: 3 }).map((e) => e.itemId)).toEqual(['a1', 'b1', 'a2']);
    expect(input(cards, { count: 1 }).map((e) => e.itemId)).toEqual(['a1']);
    expect(input(cards, { count: 0 })).toEqual([]);
    expect(input([])).toEqual([]);
  });
});

describe('answersToday', () => {
  it('counts earlier answers to the item on the local date only', async () => {
    const log = (itemId: string, when: Date) =>
      db.reviewLogs.add({
        itemId,
        skillId: 's',
        drillType: 'd',
        correct: true,
        responseMs: 500,
        rating: Rating.Good,
        hintUsed: false,
        answerGiven: 'C',
        at: when,
      });
    await log('x', at(17, 23, 59));
    await log('x', at(18, 0, 0));
    await log('x', at(18, 21));
    await log('y', at(18, 10));
    expect(await answersToday(db, 'x', at(18, 22))).toBe(2);
    expect(await answersToday(db, 'y', at(18, 22))).toBe(1);
    expect(await answersToday(db, 'z', at(18, 22))).toBe(0);
  });
});

describe('addAnswerProgress', () => {
  const answer = (over: Partial<AnswerProgressInput> = {}): AnswerProgressInput => ({
    itemId: 'note@s6f0',
    skillId: 'F2.string6-naturals',
    correct: true,
    rating: Rating.Good,
    kind: 'due',
    stabilityDays: 2,
    answeredToday: 0,
    minutes: 0.5,
    at: at(18),
    ...over,
  });

  it('awards XP, accrues minutes and logs the answer with its XP', async () => {
    const first = await addAnswerProgress(db, answer());
    expect(first.xp).toBe(10);
    expect(first.goalReached).toBe(false);
    const second = await addAnswerProgress(db, answer({ answeredToday: 1, correct: false }));
    expect(second.xp).toBe(3);
    expect(await getDailyProgress(db, '2026-10-18')).toMatchObject({
      xp: 13,
      minutes: 1,
      goalMet: false,
    });
    expect((await getGamification(db)).xpTotal).toBe(13);
    const events = await getEvents(db, { type: 'answer' });
    expect(events.map((e) => e.type === 'answer' && [e.kind, e.xp, e.correct])).toEqual([
      ['due', 10, true],
      ['due', 3, false],
    ]);
  });

  it('flips goalMet once when the daily goal is reached', async () => {
    await saveGamification(db, { dailyGoalMinutes: 5 });
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await addAnswerProgress(db, answer({ minutes: 2 })));
    expect(results.map((r) => r.goalReached)).toEqual([false, false, true, false]);
    expect(results[2]?.day).toMatchObject({ minutes: 6, goalMet: true });
    const met = await getEvents(db, { type: 'goal-met' });
    expect(met).toHaveLength(1);
    expect(met[0]).toMatchObject({ date: '2026-10-18', minutes: 6, xp: 30 });
  });

  it('keeps each local date separate', async () => {
    await addAnswerProgress(db, answer({ at: at(18, 23, 59) }));
    await addAnswerProgress(db, answer({ at: at(19, 0, 1) }));
    expect((await getDailyProgress(db, '2026-10-18')).minutes).toBe(0.5);
    expect((await getDailyProgress(db, '2026-10-19')).minutes).toBe(0.5);
  });
});

describe('settleStreak', () => {
  const met = (date: string, minutes = 10) =>
    saveDailyProgress(db, {
      date,
      xp: 50,
      minutes,
      goalMet: true,
      freezeUsed: false,
      questsCompleted: [],
    });

  it('does nothing before the goal has ever been met', async () => {
    const { state, events } = await settleStreak(db, at(18));
    expect(events).toEqual([]);
    expect(state.streakCurrent).toBe(0);
  });

  it('never settles today while its goal is unmet', async () => {
    await saveGamification(db, {
      streakCurrent: 3,
      streakLongest: 3,
      lastGoalMetDate: '2026-10-17',
    });
    await saveDailyProgress(db, { ...(await getDailyProgress(db, '2026-10-18')), minutes: 4 });
    const { events } = await settleStreak(db, at(18, 20));
    expect(events).toEqual([]);
    expect((await getGamification(db)).streakCurrent).toBe(3);
  });

  it('extends the streak once for a met goal today, however often it settles', async () => {
    await saveGamification(db, {
      streakCurrent: 3,
      streakLongest: 3,
      lastGoalMetDate: '2026-10-17',
    });
    await met('2026-10-18');
    const first = await settleStreak(db, at(18, 20));
    expect(first.events).toMatchObject([{ type: 'streak-extended', streak: 4 }]);
    const again = await settleStreak(db, at(18, 21));
    expect(again.events).toEqual([]);
    expect(await getGamification(db)).toMatchObject({
      streakCurrent: 4,
      lastGoalMetDate: '2026-10-18',
    });
  });

  it('settles a goal met yesterday whose session never finished', async () => {
    await saveGamification(db, {
      streakCurrent: 3,
      streakLongest: 3,
      lastGoalMetDate: '2026-10-16',
    });
    await met('2026-10-17');
    await settleStreak(db, at(18));
    expect((await getGamification(db)).streakCurrent).toBe(4);
  });

  it('breaks a streak on open after a missed day, and clears the window once it expires', async () => {
    await saveGamification(db, {
      streakCurrent: 5,
      streakLongest: 5,
      lastGoalMetDate: '2026-10-15',
    });
    const opened = await settleStreak(db, at(17));
    expect(opened.events).toMatchObject([
      { type: 'streak-broken', date: '2026-10-16', previousStreak: 5 },
    ]);
    expect(await getGamification(db)).toMatchObject({ streakCurrent: 0, streakBeforeBreak: 5 });
    expect(await getEvents(db, { type: 'streak-broken' })).toHaveLength(1);

    // No session at all until the window has passed: opening the app clears it.
    await settleStreak(db, at(20));
    expect(await getGamification(db)).toMatchObject({
      streakCurrent: 0,
      streakBeforeBreak: 0,
      streakRepairDeadline: null,
    });
    expect(await getEvents(db, { type: 'streak-broken' })).toHaveLength(1);
  });

  it('burns one freeze for a missed day re-settled across two app opens', async () => {
    await saveGamification(db, {
      streakCurrent: 8,
      streakLongest: 8,
      lastGoalMetDate: '2026-10-16',
      freezesHeld: 2,
    });
    const first = await settleStreak(db, at(18, 8));
    expect(first.events).toMatchObject([
      { type: 'freeze-used', date: '2026-10-17', freezesLeft: 1 },
    ]);
    expect(await db.dailyProgress.get('2026-10-17')).toMatchObject({ freezeUsed: true });

    const second = await settleStreak(db, at(18, 19));
    expect(second.events).toEqual([]);
    expect(await getGamification(db)).toMatchObject({ freezesHeld: 1, streakCurrent: 8 });
    expect(await getEvents(db, { type: 'freeze-used' })).toHaveLength(1);
  });

  it('survives concurrent settles (a StrictMode double mount)', async () => {
    await saveGamification(db, {
      streakCurrent: 8,
      streakLongest: 8,
      lastGoalMetDate: '2026-10-16',
      freezesHeld: 2,
    });
    await Promise.all([settleStreak(db, at(18)), settleStreak(db, at(18))]);
    expect((await getGamification(db)).freezesHeld).toBe(1);
    expect(await getEvents(db, { type: 'freeze-used' })).toHaveLength(1);
  });

  it('repairs mid-day once a double session lands inside the window', async () => {
    await saveGamification(db, {
      streakCurrent: 10,
      streakLongest: 10,
      lastGoalMetDate: '2026-10-15',
    });
    await settleStreak(db, at(17, 8)); // the 16th was missed: the window covers the 17th and 18th
    await met('2026-10-17', 12);
    const single = await settleStreak(db, at(17, 12));
    expect(single.events).toMatchObject([{ type: 'streak-extended', streak: 1 }]);
    await met('2026-10-17', 20);
    const double = await settleStreak(db, at(17, 18));
    expect(double.events).toMatchObject([{ type: 'streak-repaired', streak: 11 }]);
  });
});

describe('finishSessionProgress', () => {
  it('adds trailing minutes, logs the session and settles the streak', async () => {
    await saveGamification(db, { dailyGoalMinutes: 5 });
    await saveDailyProgress(db, { ...(await getDailyProgress(db, '2026-10-18')), minutes: 4.5 });
    const out = await finishSessionProgress(db, {
      sessionId: 7,
      at: at(18, 9, 10),
      minutes: 1,
      sessionMinutes: 5.5,
      xp: 80,
      itemsSeen: 12,
      accuracy: 0.9,
    });
    expect(out.goalReached).toBe(true);
    expect(out.goalMet).toBe(true);
    expect(out.state).toMatchObject({ streakCurrent: 1, lastGoalMetDate: '2026-10-18' });
    expect(out.events.map((e) => e.type)).toEqual([
      'goal-met',
      'session-complete',
      'streak-extended',
    ]);
    const [complete] = await getEvents(db, { type: 'session-complete' });
    expect(complete).toMatchObject({
      date: '2026-10-18',
      sessionId: 7,
      xp: 80,
      minutes: 5.5,
      itemsSeen: 12,
      accuracy: 0.9,
    });
  });

  it('logs a session that did not reach the goal without touching the streak', async () => {
    const out = await finishSessionProgress(db, {
      at: at(18),
      minutes: 0,
      sessionMinutes: 0,
      xp: 0,
      itemsSeen: 0,
      accuracy: 0,
    });
    expect(out).toMatchObject({ goalReached: false, goalMet: false });
    expect(out.events.map((e) => e.type)).toEqual(['session-complete']);
    expect(out.events[0]).not.toHaveProperty('sessionId');
  });
});

describe('installStreakSettle', () => {
  it('settles on install and whenever the app becomes visible again', async () => {
    await saveGamification(db, {
      streakCurrent: 5,
      streakLongest: 5,
      lastGoalMetDate: '2026-10-15',
    });
    let now = at(16, 9);
    let visibility: DocumentVisibilityState = 'visible';
    const doc = new EventTarget() as unknown as Document;
    Object.defineProperty(doc, 'visibilityState', { get: () => visibility });

    const stop = installStreakSettle(db, () => now, doc);
    await vi.waitFor(async () => expect((await getGamification(db)).streakCurrent).toBe(5));

    // Back from the background two days later: the 16th was missed.
    now = at(18, 9);
    visibility = 'hidden';
    doc.dispatchEvent(new Event('visibilitychange'));
    visibility = 'visible';
    doc.dispatchEvent(new Event('visibilitychange'));
    await vi.waitFor(async () => expect((await getGamification(db)).streakCurrent).toBe(0));
    expect(await getEvents(db, { type: 'streak-broken' })).toHaveLength(1);

    stop();
    now = at(25, 9);
    doc.dispatchEvent(new Event('visibilitychange'));
    await new Promise((r) => setTimeout(r, 20));
    expect((await getGamification(db)).streakRepairDeadline).not.toBeNull();
  });

  it('reports a failed settle instead of throwing', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    db.close();
    const stop = installStreakSettle(db, () => at(18));
    await vi.waitFor(() => expect(error).toHaveBeenCalled());
    stop();
    error.mockRestore();
  });
});
