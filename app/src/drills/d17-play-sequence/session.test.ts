import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Rating } from 'ts-fsrs';
import { DEFAULT_SETTINGS, SKILLS, createScheduler } from '../../engine';
import { FretworkDB } from '../../storage';
import { SessionRunner } from '../../session/runner';
import { DRILLS } from '../registry';
import { D17_ID, type D17Prompt } from './logic';

/** D17 through the real session runner (plan → prompt → grade → FSRS → persist). */

const C4_SKILLS = SKILLS.filter((s) => s.topic === 'C4');
const KEYS = ['spell-key:C', 'spell-key:G', 'spell-key:D'];
const DAY = 86_400_000;

let db: FretworkDB;
let n = 0;
const clock = new Date('2026-10-19T09:00:00Z');

beforeEach(async () => {
  db = new FretworkDB(`d17-session-${n++}`);
  // Every C4 skill mastered (no new items) and three keys due, last spelled with D7.
  await db.skillStates.bulkPut(
    C4_SKILLS.map((s) => ({
      skillId: s.id,
      status: 'mastered' as const,
      guideLevel: 0 as const,
      rollingAccuracy: 1,
    })),
  );
  const scheduler = createScheduler({ enableFuzz: false });
  await db.cards.bulkPut(
    KEYS.map((id, i) =>
      scheduler.seedKnownCard(
        { id, skillId: 'C4.sharp-keys' },
        new Date(clock.getTime() - (40 - 7 * i) * DAY),
        5,
      ),
    ),
  );
  await db.reviewLogs.bulkAdd(
    KEYS.map((itemId) => ({
      itemId,
      skillId: 'C4.sharp-keys',
      drillType: 'spell-it',
      correct: true,
      responseMs: 1500,
      rating: Rating.Good,
      hintUsed: false,
      answerGiven: '',
      at: new Date(clock.getTime() - 30 * DAY),
    })),
  );
});

afterEach(async () => {
  await db.delete();
});

function start(micEnabled: boolean) {
  return SessionRunner.start({
    db,
    scheduler: createScheduler({ enableFuzz: false }),
    settings: { ...DEFAULT_SETTINGS, latencyBaselineMs: 500, micEnabled },
    skills: C4_SKILLS,
    drills: DRILLS,
    now: () => clock,
    rng: () => 0.5,
    maxItems: KEYS.length,
  });
}

async function drillsServed(micEnabled: boolean): Promise<string[]> {
  const r = await start(micEnabled);
  const ids: string[] = [];
  while (!r.isOver) {
    ids.push(r.currentPrompt()!.drill.id);
    r.next();
  }
  return ids;
}

describe('D17 in a session', () => {
  it('is never served without mic mode', async () => {
    expect(await drillsServed(false)).toEqual(['spell-it', 'spell-it', 'spell-it']);
  });

  it('takes its turn after D7 in mic mode, and grades per note heard', async () => {
    expect(await drillsServed(true)).toEqual([D17_ID, D17_ID, D17_ID]);

    const r = await start(true);
    const cur = r.currentPrompt()!;
    const p = cur.prompt as D17Prompt;
    expect(p.kind).toBe('scale');
    const played = p.steps.map((s) => s.midi);
    // 8 notes in 4.15s of listening: about half a second each, within the fluent target.
    const res = await r.answer({ played, responseMs: 4150 }, 20_000);
    expect(res.result.correct).toBe(true);
    expect(res.rating).toBeGreaterThanOrEqual(Rating.Good);
    expect(res.sounds.expected).toEqual([]);
    const log = (await db.reviewLogs.toArray()).at(-1)!;
    expect(log).toMatchObject({ drillType: D17_ID, correct: true, responseMs: 500 });
  });
});
