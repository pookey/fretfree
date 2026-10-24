import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Rating } from 'ts-fsrs';
import { DEFAULT_SETTINGS, SKILLS, createScheduler } from '../../engine';
import { ENGINE_CONFIG } from '../../engine/config';
import { isSpeedEvidence } from '../../engine/speed';
import { FretworkDB, putSkillState } from '../../storage';
import { SessionRunner } from '../../session/runner';
import { DRILLS, getDrill } from '../registry';
import { D31_ID, type D31Answer, type D31Prompt } from './logic';

/** D31 through the real session runner (plan → prompt → grade → FSRS → persist). */

let db: FretworkDB;
let n = 0;
const clock = new Date('2026-10-24T09:00:00Z');
const SOFT = ENGINE_CONFIG.accentStrum.accents.softTapStrength;

beforeEach(() => {
  db = new FretworkDB(`d31-session-${n++}`);
});

afterEach(async () => {
  await db.delete();
});

/** The prompt's strokes at 120 BPM from 10 s, each `offset` ms off, strong where asked. */
function take(p: D31Prompt, offset: number, strong = (a: boolean) => a): D31Answer {
  const targetsMs = p.pulses.map((pulse) => 10_000 + pulse * 500);
  return {
    input: 'tap',
    targetsMs,
    onsets: targetsMs.map((t, i) => ({
      at: t + offset,
      strength: strong(p.accented[i]!) ? 1 : SOFT,
    })),
    window: 'strict',
    rungs: [0, 0, 1, 2],
  };
}

describe('D31 in a session', () => {
  it('is registered for every T3 and T5 skill, needs sound and holds its marks', () => {
    const drill = getDrill(D31_ID)!;
    expect([...drill.skills].sort()).toEqual(
      SKILLS.filter((s) => s.topic === 'T3' || s.topic === 'T5')
        .map((s) => s.id)
        .sort(),
    );
    expect(drill.requiresSound).toBe(true);
    expect(drill.feedbackHoldMs).toBe(ENGINE_CONFIG.accentStrum.feedbackHoldMs);
    // Graded on timing, so its response times are no evidence of speed.
    expect(isSpeedEvidence(D31_ID)).toBe(false);
  });

  it('serves the downbeat first, guided, and grades the timing and accents', async () => {
    // T5 opens once the pulse (F4) is being practised.
    const scheduler = createScheduler({ enableFuzz: false });
    await putSkillState(db, {
      skillId: 'F4.pulse',
      status: 'practising',
      guideLevel: 3,
      rollingAccuracy: 0,
    });
    const r = await SessionRunner.start({
      db,
      scheduler,
      settings: { ...DEFAULT_SETTINGS, latencyBaselineMs: 500 },
      skills: SKILLS,
      drills: DRILLS,
      now: () => clock,
      rng: () => 0,
      maxItems: 8,
      focus: { skillIds: ['T5.downbeat'], itemIds: [] },
    });
    const cur = r.currentPrompt()!;
    expect(cur.drill.id).toBe(D31_ID);
    expect(cur.entry).toMatchObject({ itemId: 'accent:4/4:downbeat', guided: true });
    const p = cur.prompt as D31Prompt;
    const res = await r.answer(take(p, 6), 20_000);
    expect(res.result).toEqual({ correct: true, expected: '16 of 16 right' });
    expect(res.rating).toBe(Rating.Hard);
    const [log] = await db.reviewLogs.toArray();
    expect(log).toMatchObject({
      drillType: D31_ID,
      itemId: 'accent:4/4:downbeat',
      correct: true,
      hintUsed: true,
      responseMs: 6,
    });
    expect(log!.answerGiven).toMatch(/^tap: \+6!, \+6, \+6, \+6, \+6!/);
  });

  it('rates unguided takes from timing, and wrong accents Again', async () => {
    const scheduler = createScheduler({ enableFuzz: false });
    await db.cards.bulkPut(
      ['accent:4/4:downbeat', 'accent:3/4:downbeat'].map((id) =>
        scheduler.seedKnownCard({ id, skillId: 'T5.downbeat' }, clock, 1),
      ),
    );
    const due = new Date(clock.getTime() + 86_400_000 * 30);
    const r = await SessionRunner.start({
      db,
      scheduler,
      settings: { ...DEFAULT_SETTINGS, latencyBaselineMs: 500 },
      skills: SKILLS.filter((s) => s.id === 'T5.downbeat'),
      drills: DRILLS,
      now: () => due,
      rng: () => 0,
      reviewOnly: true,
    });
    const ratings: number[] = [];
    for (const strong of [(a: boolean) => a, () => true]) {
      const cur = r.currentPrompt()!;
      expect(cur.entry.guided).toBe(false);
      const res = await r.answer(take(cur.prompt as D31Prompt, 5, strong), 20_000);
      ratings.push(res.rating);
      r.next();
    }
    expect(ratings).toEqual([Rating.Easy, Rating.Again]);
  });
});
