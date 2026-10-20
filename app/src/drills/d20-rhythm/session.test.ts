import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Rating } from 'ts-fsrs';
import { DEFAULT_SETTINGS, SKILLS, createScheduler } from '../../engine';
import { FretworkDB } from '../../storage';
import { SessionRunner } from '../../session/runner';
import { ENGINE_CONFIG } from '../../engine/config';
import { DRILLS, getDrill } from '../registry';
import { D20_ID, type D20Answer, type D20Prompt } from './logic';

/** D20 through the real session runner (plan → prompt → grade → FSRS → persist). */

let db: FretworkDB;
let n = 0;
const clock = new Date('2026-10-20T09:00:00Z');

beforeEach(() => {
  db = new FretworkDB(`d20-session-${n++}`);
});

afterEach(async () => {
  await db.delete();
});

/** The prompt's hits at 120 BPM from 10 s, each played `offset` ms off. */
function take(p: D20Prompt, offset: number | null): D20Answer {
  const targetsMs = p.pulses.map((pulse) => 10_000 + pulse * 500);
  return {
    input: 'tap',
    targetsMs,
    onsetsMs: offset === null ? [] : targetsMs.map((t) => t + offset),
  };
}

function start(itemIds: string[] = []) {
  return SessionRunner.start({
    db,
    scheduler: createScheduler({ enableFuzz: false }),
    settings: { ...DEFAULT_SETTINGS, latencyBaselineMs: 500 },
    skills: SKILLS,
    drills: DRILLS,
    now: () => clock,
    rng: () => 0,
    maxItems: 4,
    focus: { skillIds: ['F4.pulse'], itemIds },
  });
}

describe('D20 in a session', () => {
  it('holds a right answer’s hit-by-hit marks on screen', () => {
    expect(getDrill(D20_ID)?.feedbackHoldMs).toBe(ENGINE_CONFIG.rhythm.feedbackHoldMs);
    expect(ENGINE_CONFIG.rhythm.feedbackHoldMs).toBeGreaterThan(700);
  });

  it('serves every beat first, guided, and grades the timing, not the time taken', async () => {
    const r = await start();
    const cur = r.currentPrompt()!;
    expect(cur.drill.id).toBe(D20_ID);
    expect(cur.entry).toMatchObject({ itemId: 'tap-rhythm:quarters', guided: true });
    const p = cur.prompt as D20Prompt;
    expect(p).toMatchObject({ kind: 'tap', bpm: 60, pulses: [0, 1, 2, 3, 4, 5, 6, 7] });
    // Ten seconds of count-in and bars would be slow as an answer; it isn't graded as one.
    const res = await r.answer(take(p, 8), 10_000);
    expect(res.result).toEqual({ correct: true, expected: '8 of 8 on time' });
    // A tight take is Easy, capped at Hard on the worked example.
    expect(res.rating).toBe(Rating.Hard);
    expect(res.sounds).toEqual({ expected: [] });
    const [log] = await db.reviewLogs.toArray();
    expect(log).toMatchObject({
      drillType: D20_ID,
      itemId: 'tap-rhythm:quarters',
      correct: true,
      rating: Rating.Hard,
      hintUsed: true,
      responseMs: 8,
      answerGiven: 'tap: +8 +8 +8 +8 +8 +8 +8 +8',
    });
  });

  it('isn’t served with sound off: the click is the prompt', async () => {
    const r = await SessionRunner.start({
      db,
      scheduler: createScheduler({ enableFuzz: false }),
      settings: { ...DEFAULT_SETTINGS, latencyBaselineMs: 500, soundOn: false },
      skills: SKILLS,
      drills: DRILLS,
      now: () => clock,
      rng: () => 0,
      maxItems: 4,
      focus: { skillIds: ['F4.pulse'], itemIds: [] },
    });
    expect(getDrill(D20_ID)?.requiresSound).toBe(true);
    expect(r.isEmpty).toBe(true);
  });

  it('rates an unguided take from its timing, and a take out of time Again', async () => {
    const scheduler = createScheduler({ enableFuzz: false });
    await db.cards.bulkPut(
      ['tap-rhythm:quarters', 'tap-rhythm:half-notes'].map((id) =>
        scheduler.seedKnownCard({ id, skillId: 'F4.pulse' }, clock, 1),
      ),
    );
    const due = new Date(clock.getTime() + 86_400_000 * 30);
    const r = await SessionRunner.start({
      db,
      scheduler,
      settings: { ...DEFAULT_SETTINGS, latencyBaselineMs: 500 },
      skills: SKILLS.filter((s) => s.id === 'F4.pulse'),
      drills: DRILLS,
      now: () => due,
      rng: () => 0,
      reviewOnly: true,
    });
    const ratings: number[] = [];
    for (const offset of [5, 90]) {
      const cur = r.currentPrompt()!;
      expect(cur.entry.guided).toBe(false);
      const res = await r.answer(take(cur.prompt as D20Prompt, offset), 10_000);
      ratings.push(res.rating);
      r.next();
    }
    expect(ratings).toEqual([Rating.Easy, Rating.Again]);
  });
});
