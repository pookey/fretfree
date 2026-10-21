import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Rating, type Grade } from 'ts-fsrs';
import { DEFAULT_SETTINGS, ENGINE_CONFIG, SKILLS, createScheduler } from '../../engine';
import { DRILLS } from '../../drills/registry';
import type { D1Prompt } from '../../drills/d1-name-the-note/logic';
import { D2_ID, type D2Prompt } from '../../drills/d2-find-the-note/logic';
import { FretworkDB } from '../../storage';
import { SessionRunner, type CurrentPrompt } from '../runner';
import { latestOutcomes, progressBySkill } from '../../engine/progress';
import { CelebrationTracker } from './tracker';

let db: FretworkDB;
let n = 0;
let clock: Date;
const now = () => clock;
const scheduler = createScheduler({ enableFuzz: false });
// F1 items are served by D3, and the Ear and Rhythm tracks by their own
// drills; these tests drive D1 prompts.
const NOTE_SKILLS = SKILLS.filter((s) => !['F1', 'F4', 'I6'].includes(s.topic));

beforeEach(() => {
  db = new FretworkDB(`tracker-${n++}`);
  clock = new Date('2026-10-18T09:00:00');
});

afterEach(async () => {
  await db.delete();
});

async function start(maxItems = 16) {
  const deps = {
    db,
    scheduler,
    settings: { ...DEFAULT_SETTINGS, latencyBaselineMs: 500 },
    skills: NOTE_SKILLS,
    drills: DRILLS,
    now,
    maxItems,
  };
  const [runner, tracker] = await Promise.all([
    SessionRunner.start(deps),
    CelebrationTracker.begin({ db, skills: NOTE_SKILLS, now }),
  ]);
  return { runner, tracker };
}

/** An answer in the shape the prompt's drill checks: a note name (D1) or a cell (D2). */
function answerFor(cur: CurrentPrompt, correct: boolean): unknown {
  if (cur.drill.id === D2_ID) {
    const prompt = cur.prompt as D2Prompt;
    if (correct) return prompt.targets[0];
    const { from, to } = prompt.activeRange;
    for (let fret = from; fret <= to; fret++) {
      const pos = { string: prompt.string, fret };
      if (!prompt.targets.some((t) => t.fret === fret && t.string === pos.string)) return pos;
    }
    throw new Error('No wrong cell in the active range');
  }
  const expected = (cur.prompt as D1Prompt).expectedPc;
  return correct ? expected : expected === 'C' ? 'D' : 'C';
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
    const res = await runner.answer(answerFor(cur, !wrongAt.includes(i)), responseMs);
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
  it('celebrates a first session: XP, combo, improved items, learned today', async () => {
    const { runner, tracker } = await start();
    const combos = await play(runner, tracker, 300);
    // Four guided worked examples hold the combo at 0, then twelve fast recalls count up.
    expect(combos).toEqual([0, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(tracker.combo).toBe(12);

    const summary = await runner.finish();
    const c = await tracker.finish(summary);
    // XP is the runner's, which is what was persisted.
    expect(summary.xp).toBeGreaterThan(0);
    expect(c.xp).toBe(summary.xp);
    expect(c).toMatchObject({
      answered: 16,
      accuracy: 1,
      newItems: 4,
      itemsImproved: 4,
      bestCombo: 12,
      perfect: true,
      // Nothing to beat yet.
      personalBest: null,
    });
    // Frets 0, 1, 3 and 5 of string 6 graduated today (fast answers are Easy), but
    // nothing has been recalled across a gap yet: learned today, not known.
    expect(c.competence).toEqual([
      expect.objectContaining({ kind: 'learned', string: 6, toFret: 5, complete: false }),
    ]);
    expect(c.confetti).toBe(false);
    expect(await tracker.finish({ itemsSeen: 0, accuracy: 0, newItems: 0, xp: 0 })).toBe(c);
  });

  it('counts learning and stable the way Learn does, with a forecast past today', async () => {
    const { runner, tracker } = await start();
    await play(runner, tracker, 1500, [6]);
    const c = await tracker.finish(await runner.finish());
    // Learn's numbers for the same cards (engine/progress.ts over the review logs).
    const [cards, logs] = await Promise.all([db.cards.toArray(), db.reviewLogs.toArray()]);
    const learn = [...progressBySkill(cards, latestOutcomes(logs)).values()];
    expect(c.progress.learning).toBe(learn.reduce((n, p) => n + p.learning, 0));
    expect(c.progress.stable).toBe(learn.reduce((n, p) => n + p.stable, 0));
    expect(c.progress.learning).toBeGreaterThan(0);
    // A first session can't make an item stable at an ordinary speed.
    expect(c.progress).toMatchObject({ stable: 0, becameStable: 0 });
    expect(c.progress.nextReview?.inDays).toBeGreaterThanOrEqual(1);
  });

  it('calls items known once they are recalled on a later day', async () => {
    const first = await start();
    await play(first.runner, first.tracker, 300);
    await first.runner.finish();

    clock = new Date(clock.getTime() + 30 * 86_400_000);
    const { runner, tracker } = await start();
    await play(runner, tracker, 300);
    const c = await tracker.finish(await runner.finish());
    // Yesterday's four items came back due and were recalled: now known. Today's
    // new items are learned, not yet known.
    expect(c.competence).toEqual([
      expect.objectContaining({ kind: 'reach', string: 6, toFret: 5 }),
      expect.objectContaining({ kind: 'learned', string: 6, toFret: 10 }),
    ]);
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

  it('turns streak milestones from the runner into summary milestones', async () => {
    const tracker = await CelebrationTracker.begin({
      db,
      skills: NOTE_SKILLS,
      now,
      config: { ...ENGINE_CONFIG.gamification.celebrations, perfectMinAnswers: 1 },
    });
    tracker.record({
      itemId: 'note@s6f0',
      skillId: 'F2.string6-naturals',
      kind: 'review',
      guided: false,
      correct: true,
      rating: Rating.Good as Grade,
      responseMs: 800,
    });
    const c = await tracker.finish(
      {
        itemsSeen: 1,
        accuracy: 1,
        newItems: 0,
        xp: 10,
        events: [
          { type: 'streak-extended', date: '2026-10-18', streak: 6 },
          { type: 'streak-extended', date: '2026-10-18', streak: 7, milestone: 7 },
        ],
      },
      ['Badge: String 6 master'],
    );
    expect(c).toMatchObject({
      xp: 10,
      perfect: true,
      milestones: ['7-day streak: a real daily habit', 'Badge: String 6 master'],
      confetti: true,
    });
    // No events at all: no milestones, no confetti.
    const quiet = await CelebrationTracker.begin({ db, skills: NOTE_SKILLS, now });
    const q = await quiet.finish({ itemsSeen: 0, accuracy: 0, newItems: 0, xp: 0 });
    expect(q).toMatchObject({ milestones: [], confetti: false });
  });
});
