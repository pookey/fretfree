import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Rating } from 'ts-fsrs';
import { DEFAULT_SETTINGS, SKILLS, createScheduler, type Skill } from '../../engine';
import { FretworkDB } from '../../storage';
import { SessionRunner } from '../../session/runner';
import { DRILLS } from '../registry';
import { D19_ID, type D19Prompt } from './logic';

/** D19 through the real session runner (plan → prompt → grade → FSRS → persist). */

const skill = (id: string) => SKILLS.find((s) => s.id === id) as Skill;

let db: FretworkDB;
let n = 0;
const clock = new Date('2026-10-20T09:00:00Z');

beforeEach(() => {
  db = new FretworkDB(`d19-session-${n++}`);
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

describe('D19 in a session', () => {
  it('serves I to IV on strings 3–1 first, guided, graded per note', async () => {
    const top = skill('I1.voice-leading-top-sets');
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
    expect(cur.drill.id).toBe(D19_ID);
    expect(cur.entry).toMatchObject({ itemId: 'voice-lead:I-IV@s3', guided: true });
    const p = cur.prompt as D19Prompt;
    const res = await r.answer({ taps: p.targets }, 3 * 1000);
    expect(res.result).toEqual({ correct: true, expected: 'F in 2nd inversion on strings 3–1' });
    // A guided rep caps the rating at Hard.
    expect(res.rating).toBe(Rating.Hard);
    const [log] = await db.reviewLogs.toArray();
    expect(log).toMatchObject({
      drillType: D19_ID,
      responseMs: 1000,
      answerGiven: 's3f5 s2f6 s1f5',
    });
    expect(res.sounds.expected).toEqual(['C4', 'E4', 'G4', 'C4', 'F4', 'A4']);
  });

  it("logs a note of the key's third chord as that move, and pairs the two cards", async () => {
    const scheduler = createScheduler({ enableFuzz: false });
    const ids = ['voice-lead:I-IV@s3', 'voice-lead:I-V@s3'];
    await db.cards.bulkPut(
      ids.map((id, i) =>
        scheduler.seedKnownCard({ id, skillId: 'I1.voice-leading-top-sets' }, clock, 1 + i * 0.01),
      ),
    );
    await master(['I1.voice-leading-top-sets', 'I1.major-top-sets'], 1);
    const due = new Date(clock.getTime() + 86_400_000 * 30);
    const r = await SessionRunner.start({
      db,
      scheduler,
      settings: { ...DEFAULT_SETTINGS, latencyBaselineMs: 500 },
      skills: [skill('I1.voice-leading-top-sets')],
      drills: DRILLS,
      now: () => due,
      rng: () => 0,
      reviewOnly: true,
    });
    let cur = r.currentPrompt();
    let confused = false;
    while (cur) {
      const p = cur.prompt as D19Prompt;
      if (p.itemId === ids[0] && !confused) {
        // B, a note of G (V) in C, on string 3 below the held C.
        const wrong = { string: 3, fret: p.targets[0]!.fret - 1 };
        expect(p.key).toBe('C');
        const res = await r.answer({ taps: [wrong] }, 900);
        expect(res.result.confusedWith).toBe(ids[1]);
        confused = true;
      } else {
        await r.answer({ taps: p.targets }, 900);
      }
      r.next();
      cur = r.currentPrompt();
    }
    expect(confused).toBe(true);
    const [confusion] = await db.confusions.toArray();
    expect([confusion?.a, confusion?.b].sort()).toEqual(ids);
  });
});
