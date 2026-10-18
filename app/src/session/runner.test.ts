import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Rating } from 'ts-fsrs';
import { DEFAULT_SETTINGS, SKILLS, createScheduler, parseNoteItemId } from '../engine';
import { DRILLS } from '../drills/registry';
import type { D1Prompt } from '../drills/d1-name-the-note/logic';
import { noteAt } from '../theory';
import {
  FretworkDB,
  allCards,
  getDailyProgress,
  getEvents,
  getGamification,
  getSkillStates,
  reviewCount,
  saveGamification,
} from '../storage';
import { toLocalDate, type AnswerEvent } from '../engine/gamification';
import { SessionRunner } from './runner';

let db: FretworkDB;
let n = 0;
let clock: Date;
const deps = (over: Partial<Parameters<typeof SessionRunner.start>[0]> = {}) => ({
  db,
  scheduler: createScheduler({ enableFuzz: false }),
  settings: { ...DEFAULT_SETTINGS, latencyBaselineMs: 500 },
  skills: SKILLS,
  drills: DRILLS,
  now: () => clock,
  maxItems: 12,
  ...over,
});

beforeEach(async () => {
  db = new FretworkDB(`runner-${n++}`);
  clock = new Date('2026-10-18T09:00:00Z');
});

afterEach(async () => {
  await db.delete();
});

// F1 items are served by D3; these tests drive D1 prompts.
const NOTE_SKILLS = SKILLS.filter((s) => s.topic !== 'F1');

function correctAnswer(prompt: unknown): string {
  return (prompt as D1Prompt).expectedPc;
}

describe('SessionRunner', () => {
  it('runs a first session of new items with guided worked examples', async () => {
    const r = await SessionRunner.start(deps({ skills: NOTE_SKILLS }));
    expect(r.length).toBe(12);
    const first = r.currentPrompt()!;
    expect(first.entry.kind).toBe('new');
    expect(first.entry.guided).toBe(true);
    expect(first.guideLevel).toBe(3);
    expect(first.drill.id).toBe('name-the-note');
    expect(r.currentPrompt()).toBe(first);

    const res = await r.answer(correctAnswer(first.prompt), 400);
    expect(res.result.correct).toBe(true);
    // Guided reps count as hint use, so the rating caps at Hard.
    expect(res.rating).toBe(Rating.Hard);
    expect(res.sounds.expected).toHaveLength(1);
    r.next();

    while (!r.isOver) {
      const cur = r.currentPrompt()!;
      await r.answer(correctAnswer(cur.prompt), 900);
      r.next();
    }
    expect(r.currentPrompt()).toBeNull();
    const summary = await r.finish();
    expect(summary).toMatchObject({ itemsSeen: 12, correct: 12, accuracy: 1, newItems: 4 });
    expect(await r.finish()).toBe(summary);
    expect(await allCards(db)).toHaveLength(4);
    expect(await reviewCount(db)).toBe(12);
    const states = await getSkillStates(db);
    expect(states.get('F2.string6-naturals')?.status).toBe('practising');
  });

  it('grades by speed and retries wrong answers later in the session', async () => {
    const r = await SessionRunner.start(deps());
    await r.answer(correctAnswer(r.currentPrompt()!.prompt), 300);
    r.next();
    for (let i = 1; i < 4; i++) {
      await r.answer(correctAnswer(r.currentPrompt()!.prompt), 300);
      r.next();
    }
    // Second pass: not guided, fast → Easy; slow → Hard.
    const fast = await r.answer(correctAnswer(r.currentPrompt()!.prompt), 300);
    expect(fast.rating).toBe(Rating.Easy);
    r.next();
    const slow = await r.answer(correctAnswer(r.currentPrompt()!.prompt), 9000);
    expect(slow.rating).toBe(Rating.Hard);
    r.next();

    const before = r.length;
    const cur = r.currentPrompt()!;
    const wrong = (cur.prompt as D1Prompt).expectedPc === 'C' ? 'D' : 'C';
    const res = await r.answer(wrong, 800);
    expect(res.result.correct).toBe(false);
    expect(res.rating).toBe(Rating.Again);
    expect(res.sounds.given).toHaveLength(1);
    expect(r.length).toBe(before + 1);
    expect(r.position).toBe(6);
    const confusions = await db.confusions.toArray();
    expect(confusions[0]?.count).toBe(1);
  });

  it('serves due reviews in a later session', async () => {
    const r1 = await SessionRunner.start(deps());
    while (!r1.isOver) {
      await r1.answer(correctAnswer(r1.currentPrompt()!.prompt), 900);
      r1.next();
    }
    await r1.finish();
    clock = new Date('2026-10-25T09:00:00Z');
    const r2 = await SessionRunner.start(deps());
    const kinds = Array.from({ length: r2.length }, () => {
      const k = r2.currentPrompt()!.entry.kind;
      r2.next();
      return k;
    });
    expect(kinds).toContain('review');
    expect(kinds.filter((k) => k === 'review').length).toBeLessThanOrEqual(Math.floor(12 * 0.7));
  });

  it('ends when the time budget runs out and marks mastered skills', async () => {
    const r = await SessionRunner.start(
      deps({ settings: { ...DEFAULT_SETTINGS, sessionMinutes: 5 } }),
    );
    await r.answer(correctAnswer(r.currentPrompt()!.prompt), 500);
    r.next();
    clock = new Date(clock.getTime() + 5 * 60_000);
    expect(r.isOver).toBe(true);
    const summary = await r.finish();
    expect(summary.itemsSeen).toBe(1);
    expect(summary.durationMs).toBe(5 * 60_000);
  });

  it('marks a skill mastered when every item is stable and fast', async () => {
    const scheduler = createScheduler({ enableFuzz: false });
    const skill = SKILLS.find((s) => s.id === 'F2.string6-naturals')!;
    const old = new Date('2026-09-01T09:00:00Z');
    await db.cards.bulkPut(skill.items().map((i) => scheduler.seedKnownCard(i, old, 30)));
    clock = new Date('2026-10-18T09:00:00Z');
    const r = await SessionRunner.start(deps({ scheduler, skills: [skill], maxItems: 10 }));
    expect(r.isEmpty).toBe(false);
    while (!r.isOver) {
      const cur = r.currentPrompt()!;
      const pos = parseNoteItemId(cur.entry.itemId)!;
      await r.answer(noteAt(pos).pc, 800);
      r.next();
    }
    const summary = await r.finish();
    expect(summary.improvedSkills).toContain('F2.string6-naturals');
    expect((await getSkillStates(db)).get('F2.string6-naturals')?.status).toBe('mastered');
  });

  it('plans only items a registered drill can test', async () => {
    const scheduler = createScheduler({ enableFuzz: false });
    const skill = SKILLS.find((s) => s.id === 'F2.string6-naturals')!;
    const find = skill.items().find((i) => i.id.startsWith('find:'))!;
    await db.cards.put(scheduler.seedKnownCard(find, new Date('2026-09-01T09:00:00Z'), 1));
    const r = await SessionRunner.start(deps({ scheduler, skills: NOTE_SKILLS, maxItems: 40 }));
    const planned = Array.from({ length: r.length }, () => {
      const id = r.currentPrompt()!.entry.itemId;
      r.next();
      return id;
    });
    expect(planned.length).toBeGreaterThan(0);
    expect(planned.every((id) => parseNoteItemId(id) !== null)).toBe(true);
  });

  it('accepts the answer to a prompt on screen when the time budget runs out', async () => {
    const r = await SessionRunner.start(deps());
    const cur = r.currentPrompt()!;
    clock = new Date(clock.getTime() + 10 * 60_000);
    expect(r.isOver).toBe(true);
    const res = await r.answer(correctAnswer(cur.prompt), 900);
    expect(res.result.correct).toBe(true);
    r.next();
    expect(r.currentPrompt()).toBeNull();
    expect(await reviewCount(db)).toBe(1);
  });

  it('refuses to answer once the session is over', async () => {
    const r = await SessionRunner.start(deps({ maxItems: 0, skills: [] }));
    expect(r.isEmpty).toBe(true);
    await expect(r.answer('C', 100)).rejects.toThrow(/No active prompt/);
  });
});

describe('SessionRunner lifecycle', () => {
  it('reports when it has been finished', async () => {
    const r = await SessionRunner.start(deps());
    expect(r.isFinished).toBe(false);
    await r.finish();
    expect(r.isFinished).toBe(true);
  });
});

describe('SessionRunner gamification', () => {
  const answerEvents = async () =>
    (await getEvents(db, { type: 'answer' })) as unknown as (AnswerEvent & { at: Date })[];

  it('awards decaying XP across new-block reps and logs every answer', async () => {
    const r = await SessionRunner.start(deps());
    const xp: number[] = [];
    while (!r.isOver) {
      const res = await r.answer(correctAnswer(r.currentPrompt()!.prompt), 3000);
      xp.push(res.xp);
      r.next();
    }
    // 4 new items × 3 reps. Guided first reps cap at Hard (10 XP), later reps
    // are answered slowly (Hard) and decay: 10 → 5 → 3.
    expect(xp).toEqual([10, 10, 10, 10, 5, 5, 5, 5, 3, 3, 3, 3]);
    const events = await answerEvents();
    expect(events.map((e) => e.xp)).toEqual(xp);
    expect(events.every((e) => e.kind === 'new')).toBe(true);
    const summary = await r.finish();
    expect(summary.xp).toBe(72);
    expect((await getGamification(db)).xpTotal).toBe(72);
    expect((await getDailyProgress(db, toLocalDate(clock))).xp).toBe(72);
  });

  it('pays a retried miss half, under the kind of its first appearance', async () => {
    const scheduler = createScheduler({ enableFuzz: false });
    const skill = SKILLS.find((s) => s.id === 'F2.string6-naturals')!;
    const old = new Date('2026-10-08T09:00:00Z');
    await db.cards.bulkPut(skill.items().map((i) => scheduler.seedKnownCard(i, old, 5)));
    const r = await SessionRunner.start(deps({ scheduler, skills: [skill], maxItems: 6 }));
    const first = r.currentPrompt()!;
    expect(first.entry.kind).toBe('review');
    const wrong = (first.prompt as D1Prompt).expectedPc === 'C' ? 'D' : 'C';
    const miss = await r.answer(wrong, 800);
    expect(miss.xp).toBe(6);
    r.next();
    while (!r.isOver) {
      const cur = r.currentPrompt()!;
      const res = await r.answer(noteAt(parseNoteItemId(cur.entry.itemId)!).pc, 800);
      if (cur.entry.kind === 'retry') {
        expect(cur.entry.itemId).toBe(first.entry.itemId);
        // Correct and fluent (12 XP) on a due card, halved by the earlier miss today.
        expect(res.xp).toBe(6);
      }
      r.next();
    }
    const events = await answerEvents();
    expect(events.map((e) => e.kind)).toEqual(Array(events.length).fill('due'));
    expect(events).toHaveLength(7);
  });

  it('reaches the daily goal mid-session and extends the streak at finish', async () => {
    await saveGamification(db, { dailyGoalMinutes: 5 });
    const r = await SessionRunner.start(deps({ maxItems: 12 }));
    const reached: boolean[] = [];
    while (!r.isOver) {
      clock = new Date(clock.getTime() + 40_000);
      const res = await r.answer(correctAnswer(r.currentPrompt()!.prompt), 900);
      reached.push(res.goalReached);
      r.next();
    }
    // 40 s an answer: the 8th answer passes 5 minutes.
    expect(reached.indexOf(true)).toBe(7);
    expect(reached.filter(Boolean)).toHaveLength(1);
    const today = toLocalDate(clock);
    expect(await getDailyProgress(db, today)).toMatchObject({ goalMet: true, minutes: 8 });
    expect(await getEvents(db, { type: 'goal-met' })).toHaveLength(1);
    // The streak waits for the session to finish.
    expect((await getGamification(db)).streakCurrent).toBe(0);

    const summary = await r.finish();
    expect(summary).toMatchObject({ goalMet: true, goalReached: true, streak: 1, minutes: 8 });
    expect(summary.events.map((e) => e.type)).toEqual(['session-complete', 'streak-extended']);
    expect(await getGamification(db)).toMatchObject({ streakCurrent: 1, lastGoalMetDate: today });
    const [complete] = await getEvents(db, { type: 'session-complete' });
    expect(complete).toMatchObject({ date: today, itemsSeen: 12, minutes: 8, accuracy: 1 });
  });

  it('caps idle gaps and counts the time after the last answer', async () => {
    const r = await SessionRunner.start(deps({ maxItems: 12 }));
    clock = new Date(clock.getTime() + 5 * 60_000); // walked away mid-prompt
    await r.answer(correctAnswer(r.currentPrompt()!.prompt), 900);
    r.next();
    clock = new Date(clock.getTime() + 30_000);
    const summary = await r.finish();
    expect(summary.minutes).toBe(1.5);
    expect(summary.goalMet).toBe(false);
    expect(summary.streak).toBe(0);
    expect((await getDailyProgress(db, toLocalDate(clock))).minutes).toBe(1.5);
  });

  it('tops up a dry queue with stretch items, never with stable cards', async () => {
    const scheduler = createScheduler({ enableFuzz: false });
    const skill = SKILLS.find((s) => s.id === 'F2.string6-naturals')!;
    const notes = skill.items().filter((i) => parseNoteItemId(i.id));
    const yesterday = new Date(clock.getTime() - 86_400_000);
    const [stable, ...learning] = notes;
    await db.cards.bulkPut([
      scheduler.seedKnownCard(stable!, yesterday, 30),
      ...learning.map((i) => scheduler.seedKnownCard(i, yesterday, 3)),
    ]);
    const r = await SessionRunner.start(deps({ scheduler, skills: [skill], maxItems: 40 }));
    const planned = Array.from({ length: r.length }, (_, i) => {
      const entry = r.currentPrompt()!.entry;
      r.next();
      return { ...entry, i };
    });
    // Nothing is due and nothing is new: only the learning cards, once each.
    expect(planned.map((e) => e.kind)).toEqual(Array(learning.length).fill('stretch'));
    expect(new Set(planned.map((e) => e.itemId))).toEqual(new Set(learning.map((i) => i.id)));
    expect(planned.some((e) => e.itemId === stable!.id)).toBe(false);

    const r2 = await SessionRunner.start(deps({ scheduler, skills: [skill], maxItems: 40 }));
    const res = await r2.answer(noteAt(parseNoteItemId(r2.currentPrompt()!.entry.itemId)!).pc, 800);
    expect(res.xp).toBe(10); // (6 + 4 + 2) × 0.8 stretch weight
    expect((await answerEvents())[0]?.kind).toBe('stretch');
  });
});
