import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Rating } from 'ts-fsrs';
import { DEFAULT_SETTINGS, SKILLS, createScheduler, type Skill } from '../../engine';
import { FretworkDB } from '../../storage';
import { SessionRunner } from '../../session/runner';
import { DRILLS } from '../registry';
import { D18_ID, type D18Prompt } from './logic';

/** D18 through the real session runner (plan → prompt → grade → FSRS → persist). */

const skill = (id: string) => SKILLS.find((s) => s.id === id) as Skill;

let db: FretworkDB;
let n = 0;
const clock = new Date('2026-10-20T09:00:00Z');

beforeEach(() => {
  db = new FretworkDB(`d18-session-${n++}`);
});

afterEach(async () => {
  await db.delete();
});

async function master(skillIds: readonly string[], guideLevel: 0 | 1 = 0) {
  await db.skillStates.bulkPut(
    skillIds.map((skillId) => ({
      skillId,
      status: 'mastered' as const,
      guideLevel,
      rollingAccuracy: 1,
    })),
  );
}

describe('D18 in a session', () => {
  it('serves root position on strings 3–1 first, guided, graded per note', async () => {
    const top = skill('I1.major-top-sets');
    await master(top.prerequisites);
    const r = await SessionRunner.start({
      db,
      scheduler: createScheduler({ enableFuzz: false }),
      settings: { ...DEFAULT_SETTINGS, latencyBaselineMs: 500 },
      skills: SKILLS,
      drills: DRILLS,
      now: () => clock,
      rng: () => 0,
      maxItems: 8,
      focus: { skillIds: [top.id], itemIds: [] },
    });
    const cur = r.currentPrompt()!;
    expect(cur.drill.id).toBe(D18_ID);
    expect(cur.entry).toMatchObject({ itemId: 'inversion:0@s3/major', guided: true });
    const p = cur.prompt as D18Prompt;
    const res = await r.answer({ kind: 'taps', taps: p.targets }, 2 * 1000);
    expect(res.result).toEqual({ correct: true, expected: 'C in root position on strings 3–1' });
    // A guided rep caps the rating at Hard.
    expect(res.rating).toBe(Rating.Hard);
    const [log] = await db.reviewLogs.toArray();
    expect(log).toMatchObject({ drillType: D18_ID, responseMs: 1000, answerGiven: 's2f5 s1f3' });
    expect(res.sounds.expected).toEqual(['C4', 'E4', 'G4']);
  });

  it('logs a wrong inversion name as that confusion, and pairs the two cards', async () => {
    const scheduler = createScheduler({ enableFuzz: false });
    const ids = [0, 1, 2].map((inv) => `inversion-name:${inv}@s3/major`);
    await db.cards.bulkPut(
      ids.map((id, i) =>
        scheduler.seedKnownCard({ id, skillId: 'I1.major-top-sets' }, clock, 1 + i * 0.01),
      ),
    );
    await master(['I1.major-top-sets', 'C6.triad-cores'], 1);
    const due = new Date(clock.getTime() + 86_400_000 * 30);
    const start = () =>
      SessionRunner.start({
        db,
        scheduler,
        settings: { ...DEFAULT_SETTINGS, latencyBaselineMs: 500 },
        skills: [skill('I1.major-top-sets')],
        drills: DRILLS,
        now: () => due,
        rng: () => 0,
        reviewOnly: true,
      });
    const r = await start();
    let cur = r.currentPrompt();
    let confused = false;
    while (cur) {
      const p = cur.prompt as D18Prompt;
      if (p.inversion === 0 && !confused) {
        const res = await r.answer({ kind: 'inversion', inversion: 2 }, 900);
        expect(res.result.confusedWith).toBe(ids[2]);
        confused = true;
      } else {
        await r.answer({ kind: 'inversion', inversion: p.inversion }, 900);
      }
      r.next();
      cur = r.currentPrompt();
    }
    const [confusion] = await db.confusions.toArray();
    expect([confusion?.a, confusion?.b].sort()).toEqual([ids[0], ids[2]]);
  });
});
