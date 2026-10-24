import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Rating } from 'ts-fsrs';
import { DEFAULT_SETTINGS, SKILLS, createScheduler } from '../../engine';
import { ENGINE_CONFIG } from '../../engine/config';
import { isSpeedEvidence } from '../../engine/speed';
import { FretworkDB, putSkillState } from '../../storage';
import { SessionRunner } from '../../session/runner';
import { DRILLS, getDrill } from '../registry';
import { D27_ID, type D27Answer, type D27Prompt } from './logic';

/** D27 through the real session runner (plan → prompt → grade → FSRS → persist). */

let db: FretworkDB;
let n = 0;
const clock = new Date('2026-10-24T09:00:00Z');

beforeEach(() => {
  db = new FretworkDB(`d27-session-${n++}`);
});

afterEach(async () => {
  await db.delete();
});

/** The prompt's notes from 10 s, each played `offset` ms off, at the given pulses. */
function take(p: D27Prompt, offset: number, at: readonly number[] = p.pulses): D27Answer {
  const ms = 60_000 / p.bpm;
  const time = (pulse: number) => 10_000 + pulse * ms;
  return {
    input: 'tap',
    targetsMs: p.pulses.map(time),
    partnerTargetsMs: (p.partnerPulses ?? []).map(time),
    onsetsMs: at.map((pulse) => time(pulse) + offset),
    window: 'strict',
  };
}

describe('D27 in a session', () => {
  it('is registered for every R4 skill, needs sound, and holds its marks', () => {
    const drill = getDrill(D27_ID)!;
    expect(drill.skills).toEqual(SKILLS.filter((s) => s.topic === 'R4').map((s) => s.id));
    expect(drill.requiresSound).toBe(true);
    expect(drill.feedbackHoldMs).toBe(ENGINE_CONFIG.rhythmReading.feedbackHoldMs);
    // Graded on timing, so its response times are no evidence of speed.
    expect(isSpeedEvidence(D27_ID)).toBe(false);
  });

  it('serves a new cell guided, and grades the timing, not the time taken', async () => {
    // R4.dotted opens once the sixteenths are being practised.
    await putSkillState(db, {
      skillId: 'R4.sixteenths',
      status: 'practising',
      guideLevel: 3,
      rollingAccuracy: 0,
    });
    const r = await SessionRunner.start({
      db,
      scheduler: createScheduler({ enableFuzz: false }),
      settings: { ...DEFAULT_SETTINGS, latencyBaselineMs: 500 },
      skills: SKILLS,
      drills: DRILLS,
      now: () => clock,
      rng: () => 0,
      maxItems: 8,
      focus: { skillIds: ['R4.dotted'], itemIds: [] },
    });
    const cur = r.currentPrompt()!;
    expect(cur.drill.id).toBe(D27_ID);
    expect(cur.entry).toMatchObject({ itemId: 'rhythm:dotted-8th-16th', guided: true });
    const p = cur.prompt as D27Prompt;
    expect(p).toMatchObject({ style: 'blocked', meter: '4/4', bar: '8. 16 8. 16 8. 16 8. 16' });
    const res = await r.answer(take(p, 8), 12_000);
    expect(res.result).toEqual({
      correct: true,
      expected: '16 of 16 on time',
      concept: 'rhythm:dotted-8th-16th',
    });
    // Easy, capped at Hard on the worked example.
    expect(res.rating).toBe(Rating.Hard);
    const [log] = await db.reviewLogs.toArray();
    expect(log).toMatchObject({
      drillType: D27_ID,
      itemId: 'rhythm:dotted-8th-16th',
      correct: true,
      hintUsed: true,
      responseMs: 8,
    });
  });

  it('logs a dotted bar tapped straight as a confusion with the straight cell', async () => {
    const scheduler = createScheduler({ enableFuzz: false });
    await db.cards.put(
      scheduler.seedKnownCard({ id: 'rhythm:dotted-8th-16th', skillId: 'R4.dotted' }, clock, 1),
    );
    const due = new Date(clock.getTime() + 86_400_000 * 30);
    const r = await SessionRunner.start({
      db,
      scheduler,
      settings: { ...DEFAULT_SETTINGS, latencyBaselineMs: 500 },
      skills: SKILLS.filter((s) => s.id === 'R4.dotted'),
      drills: DRILLS,
      now: () => due,
      rng: () => 0,
      reviewOnly: true,
    });
    const cur = r.currentPrompt()!;
    expect(cur.entry.guided).toBe(false);
    const p = cur.prompt as D27Prompt;
    const res = await r.answer(take(p, 5, p.partnerPulses!), 12_000);
    expect(res.result).toMatchObject({ correct: false, confusedWith: 'rhythm:two-8ths' });
    expect(res.rating).toBe(Rating.Again);
    const confusions = await db.confusions.toArray();
    expect(confusions).toHaveLength(1);
    expect([confusions[0]!.a, confusions[0]!.b].sort()).toEqual([
      'rhythm:dotted-8th-16th',
      'rhythm:two-8ths',
    ]);
  });

  it('isn’t served with sound off: the cell is heard before it is read', async () => {
    const r = await SessionRunner.start({
      db,
      scheduler: createScheduler({ enableFuzz: false }),
      settings: { ...DEFAULT_SETTINGS, latencyBaselineMs: 500, soundOn: false },
      skills: SKILLS,
      drills: DRILLS,
      now: () => clock,
      rng: () => 0,
      maxItems: 8,
      focus: { skillIds: ['R4.dotted'], itemIds: [] },
    });
    expect(r.isEmpty).toBe(true);
  });
});
