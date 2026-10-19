import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Rating } from 'ts-fsrs';
import { DEFAULT_SETTINGS, SKILLS, createScheduler, type Skill } from '../../engine';
import { FretworkDB } from '../../storage';
import { SessionRunner } from '../../session/runner';
import { DRILLS } from '../registry';
import { D38_ID, d38Tab, type D38Prompt } from './logic';

/** D38 through the real session runner (plan → prompt → grade → FSRS → persist). */

const skill = (id: string) => SKILLS.find((s) => s.id === id) as Skill;

let db: FretworkDB;
let n = 0;
const clock = new Date('2026-10-19T09:00:00Z');

beforeEach(() => {
  db = new FretworkDB(`d38-session-${n++}`);
});

afterEach(async () => {
  await db.delete();
});

async function start() {
  const triads = skill('C5.build-triads');
  await db.skillStates.bulkPut(
    triads.prerequisites.map((skillId) => ({
      skillId,
      status: 'mastered' as const,
      guideLevel: 0 as const,
      rollingAccuracy: 1,
    })),
  );
  return SessionRunner.start({
    db,
    scheduler: createScheduler({ enableFuzz: false }),
    settings: { ...DEFAULT_SETTINGS, latencyBaselineMs: 500 },
    skills: SKILLS,
    drills: DRILLS,
    now: () => clock,
    rng: () => 0,
    maxItems: 4,
    focus: { skillIds: ['C5.build-triads'], itemIds: [] },
  });
}

describe('D38 in a session', () => {
  it('serves the first build guided, graded per string', async () => {
    const r = await start();
    const cur = r.currentPrompt()!;
    expect(cur.drill.id).toBe(D38_ID);
    expect(cur.entry).toMatchObject({ itemId: 'build-chord:major@s6', guided: true });
    const p = cur.prompt as D38Prompt;
    // C on string 6 sits at fret 8: rng 0 picks C.
    expect(p).toMatchObject({ chord: 'C', anchor: { string: 6, fret: 8 } });
    const res = await r.answer(p.example, 5 * 1000);
    expect(res.result).toEqual({ correct: true, expected: 'C (C E G)', concept: 'triad:maj' });
    // A guided rep caps the rating at Hard.
    expect(res.rating).toBe(Rating.Hard);
    const [log] = await db.reviewLogs.toArray();
    expect(log).toMatchObject({ drillType: D38_ID, responseMs: 1000, correct: true });
    expect(d38Tab(p, p.example)).toBe('8 10 10 9 8 8');
  });

  it('logs building the minor chord for the major as that confusion', async () => {
    const r = await start();
    const p = r.currentPrompt()!.prompt as D38Prompt;
    // The E-shape barre with the 3rd lowered: Cm.
    const minor = p.example.map((n) => (n.string === 3 ? { ...n, fret: n.fret - 1 } : n));
    const res = await r.answer(minor, 4000);
    expect(res.result).toMatchObject({ correct: false, confusedWith: 'triad:min' });
    const [confusion] = await db.confusions.toArray();
    expect([confusion?.a, confusion?.b].sort()).toEqual(['triad:maj', 'triad:min']);
  });
});
