import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Rating } from 'ts-fsrs';
import { DEFAULT_SETTINGS, SKILLS, createScheduler, type Skill } from '../../engine';
import { FretworkDB } from '../../storage';
import { SessionRunner } from '../../session/runner';
import { DRILLS } from '../registry';
import { D8_ID, d8Targets, type D8Prompt } from './logic';

/** D8 through the real session runner (plan → prompt → grade → FSRS → persist). */

const skill = (id: string) => SKILLS.find((s) => s.id === id) as Skill;

let db: FretworkDB;
let n = 0;
const clock = new Date('2026-10-19T09:00:00Z');

beforeEach(() => {
  db = new FretworkDB(`d8-session-${n++}`);
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

describe('D8 in a session', () => {
  it('starts with the root, guided, in both directions', async () => {
    const triads = skill('C5.tones-triads');
    await master(triads.prerequisites);
    const r = await SessionRunner.start({
      db,
      scheduler: createScheduler({ enableFuzz: false }),
      settings: { ...DEFAULT_SETTINGS, latencyBaselineMs: 500 },
      skills: SKILLS,
      drills: DRILLS,
      now: () => clock,
      rng: () => 0,
      maxItems: 4,
      focus: { skillIds: ['C5.tones-triads'], itemIds: [] },
    });
    const cur = r.currentPrompt()!;
    expect(cur.drill.id).toBe(D8_ID);
    expect(cur.entry).toMatchObject({ itemId: 'chord-tone:1@major', guided: true });
    const p = cur.prompt as D8Prompt;
    expect(p.mode).toBe('tap');
    const res = await r.answer(d8Targets(p)[0], 1200);
    expect(res.result).toEqual({ correct: true, expected: `the root of ${p.chord}, ${p.root}` });
    // A guided rep caps the rating at Hard.
    expect(res.rating).toBe(Rating.Hard);
    const [log] = await db.reviewLogs.toArray();
    expect(log).toMatchObject({ drillType: D8_ID, correct: true, itemId: 'chord-tone:1@major' });
    // The chord, then the answer's note on its own.
    expect(res.sounds.expected).toHaveLength(p.notes.length + 1);
  });

  it('pairs the 3rd with the ♭3, and logs naming one as the other', async () => {
    const scheduler = createScheduler({ enableFuzz: false });
    const ids = ['chord-tone-name:3@major', 'chord-tone-name:5@minor', 'chord-tone-name:b3@minor'];
    await db.cards.bulkPut(
      ids.map((id, i) =>
        scheduler.seedKnownCard({ id, skillId: 'C5.tones-triads' }, clock, 1 + i * 0.01),
      ),
    );
    await master(['C5.tones-triads', ...skill('C5.tones-triads').prerequisites], 1);
    const due = new Date(clock.getTime() + 86_400_000 * 30);
    const r = await SessionRunner.start({
      db,
      scheduler,
      settings: { ...DEFAULT_SETTINGS, latencyBaselineMs: 500 },
      skills: [skill('C5.tones-triads')],
      drills: DRILLS,
      now: () => due,
      rng: () => 0,
      reviewOnly: true,
    });
    const order: string[] = [];
    let cur = r.currentPrompt();
    let confused = false;
    while (cur) {
      order.push(cur.entry.itemId);
      const p = cur.prompt as D8Prompt;
      if (p.degree === 'b3' && !confused) {
        const res = await r.answer('3', 900);
        expect(res.result).toMatchObject({ correct: false, confusedWith: 'M3', concept: 'm3' });
        confused = true;
      } else {
        await r.answer(p.degree, 900);
      }
      r.next();
      cur = r.currentPrompt();
    }
    expect(Math.abs(order.indexOf(ids[0]!) - order.indexOf(ids[2]!))).toBe(1);
    const [confusion] = await db.confusions.toArray();
    expect([confusion?.a, confusion?.b].sort()).toEqual(['M3', 'm3']);
  });
});
