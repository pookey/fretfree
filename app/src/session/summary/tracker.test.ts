import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Rating, type Grade } from 'ts-fsrs';
import { DEFAULT_SETTINGS, ENGINE_CONFIG, SKILLS, createScheduler } from '../../engine';
import { xpForAnswer } from '../../engine/gamification';
import { DRILLS } from '../../drills/registry';
import type { D1Prompt } from '../../drills/d1-name-the-note/logic';
import { FretworkDB, recordAnswer, startSessionLog } from '../../storage';
import { SessionRunner } from '../runner';
import { CelebrationTracker } from './tracker';

let db: FretworkDB;
let n = 0;
let clock: Date;
const now = () => clock;
const scheduler = createScheduler({ enableFuzz: false });

beforeEach(() => {
  db = new FretworkDB(`tracker-${n++}`);
  clock = new Date('2026-10-18T09:00:00');
});

afterEach(async () => {
  await db.delete();
});

async function start(maxItems = 12) {
  const deps = {
    db,
    scheduler,
    settings: { ...DEFAULT_SETTINGS, latencyBaselineMs: 500 },
    skills: SKILLS,
    drills: DRILLS,
    now,
    maxItems,
  };
  const [runner, tracker] = await Promise.all([
    SessionRunner.start(deps),
    CelebrationTracker.begin({ db, skills: SKILLS, now }),
  ]);
  return { runner, tracker };
}

/** Answer every prompt, correct unless `wrongAt` includes its position. */
async function play(
  runner: SessionRunner,
  tracker: CelebrationTracker,
  responseMs: number,
  wrongAt: number[] = [],
) {
  const combos: number[] = [];
  let i = 0;
  while (!runner.isOver) {
    const cur = runner.currentPrompt()!;
    const expected = (cur.prompt as D1Prompt).expectedPc;
    const answer = wrongAt.includes(i) ? (expected === 'C' ? 'D' : 'C') : expected;
    const res = await runner.answer(answer, responseMs);
    combos.push(
      tracker.record({
        ...cur.entry,
        correct: res.result.correct,
        rating: res.rating,
        responseMs,
      }).combo,
    );
    runner.next();
    clock = new Date(clock.getTime() + 5_000);
    i++;
  }
  return combos;
}

describe('CelebrationTracker', () => {
  it('celebrates a first session: XP, combo, improved items and competence', async () => {
    const { runner, tracker } = await start();
    const combos = await play(runner, tracker, 300);
    // Four guided worked examples hold the combo at 0, then eight fast recalls count up.
    expect(combos).toEqual([0, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(tracker.combo).toBe(8);

    const c = await tracker.finish(await runner.finish());
    // Guided reps rate Hard, fast unguided ones Easy; repeats today decay.
    const hard = xpForAnswer({
      correct: true,
      rating: Rating.Hard,
      kind: 'new',
      stabilityDays: 0,
      answeredToday: 0,
    });
    const easy = (k: number) =>
      xpForAnswer({
        correct: true,
        rating: Rating.Easy,
        kind: 'new',
        stabilityDays: 0,
        answeredToday: k,
      });
    expect(c.xp).toBe(4 * (hard + easy(1) + easy(2)));
    expect(c).toMatchObject({
      answered: 12,
      accuracy: 1,
      newItems: 4,
      itemsImproved: 4,
      bestCombo: 8,
      perfect: true,
      // Nothing to beat yet.
      personalBest: null,
    });
    // Frets 0, 1, 3 and 5 of string 6 graduated: the run reaches fret 5.
    expect(c.competence).toEqual([
      expect.objectContaining({ kind: 'reach', string: 6, toFret: 5, complete: false }),
    ]);
    expect(c.confetti).toBe(false);
    expect(await tracker.finish({ itemsSeen: 0, accuracy: 0, newItems: 0 })).toBe(c);
  });

  it('resets the combo on a miss and is not perfect', async () => {
    const { runner, tracker } = await start();
    const combos = await play(runner, tracker, 300, [5]);
    expect(combos.slice(4, 8)).toEqual([1, 0, 1, 2]);
    const c = await tracker.finish(await runner.finish());
    expect(c.perfect).toBe(false);
    expect(c.bestCombo).toBeGreaterThanOrEqual(2);
  });

  it('spots a new personal-best speed against earlier sessions', async () => {
    let first = await start();
    await play(first.runner, first.tracker, 1500);
    await first.runner.finish();

    clock = new Date(clock.getTime() + 3_600_000);
    const second = await start();
    await play(second.runner, second.tracker, 400);
    const c = await second.tracker.finish(await second.runner.finish());
    expect(c.personalBest).toEqual({ medianMs: 400, previousMs: 1500 });

    clock = new Date(clock.getTime() + 3_600_000);
    first = await start();
    await play(first.runner, first.tracker, 900);
    expect((await first.tracker.finish(await first.runner.finish())).personalBest).toBeNull();
  });

  it('decays XP for items already answered earlier today', async () => {
    const item = { itemId: 'note@s6f0', skillId: 'F2.string6-naturals' };
    await startSessionLog(db, new Date(clock.getTime() - 60_000));
    await recordAnswer(db, {
      card: scheduler.newCard({ id: item.itemId, skillId: item.skillId }, clock),
      log: {
        ...item,
        drillType: 'name-the-note',
        correct: true,
        responseMs: 900,
        rating: Rating.Good,
        hintUsed: false,
        answerGiven: 'E',
        at: new Date(clock.getTime() - 30_000),
      },
    });
    const tracker = await CelebrationTracker.begin({
      db,
      skills: SKILLS,
      now,
      config: { ...ENGINE_CONFIG.gamification.celebrations, perfectMinAnswers: 1 },
    });
    const answer = {
      ...item,
      kind: 'review' as const,
      guided: false,
      correct: true,
      rating: Rating.Good as Grade,
      responseMs: 800,
    };
    const fresh = xpForAnswer({ ...answer, kind: 'due', stabilityDays: 0, answeredToday: 0 });
    expect(tracker.record(answer).xp).toBe(Math.round(fresh * 0.5));
    expect(tracker.record(answer).xp).toBe(Math.round(fresh * 0.25));
    const c = await tracker.finish({ itemsSeen: 2, accuracy: 1, newItems: 0 }, ['7-day streak']);
    expect(c).toMatchObject({ perfect: true, milestones: ['7-day streak'], confetti: true });
  });
});
