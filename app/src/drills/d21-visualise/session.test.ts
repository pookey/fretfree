import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, SKILLS, createScheduler, type Skill } from '../../engine';
import { FretworkDB } from '../../storage';
import { SessionRunner } from '../../session/runner';
import { D10_ID } from '../d10-which-shape/meta';
import { D9_ID } from '../d9-build-caged/meta';
import { DRILLS } from '../registry';
import { D21_ID, type D21Prompt } from './logic';

/** D21 through the real session runner (plan → prompt → grade → FSRS → persist). */

const skill = (id: string) => SKILLS.find((s) => s.id === id) as Skill;

let db: FretworkDB;
let n = 0;
const clock = new Date('2026-10-20T09:00:00Z');
const due = new Date(clock.getTime() + 86_400_000 * 30);

beforeEach(() => {
  db = new FretworkDB(`d21-session-${n++}`);
});

afterEach(async () => {
  await db.delete();
});

/** Known, due whole-shape cards, last served by `drillType`. */
async function seed(shapes: readonly string[], drillType: string) {
  const scheduler = createScheduler({ enableFuzz: false });
  const shapesSkill = skill('C6.major-shapes');
  await db.skillStates.bulkPut(
    [...shapesSkill.prerequisites, 'C6.major-shapes'].map((skillId) => ({
      skillId,
      status: 'mastered' as const,
      guideLevel: 1 as const,
      rollingAccuracy: 1,
    })),
  );
  const ids = shapes.map((s) => `caged:${s}-shape@major`);
  await db.cards.bulkPut(
    ids.map((id, i) =>
      scheduler.seedKnownCard({ id, skillId: 'C6.major-shapes' }, clock, 1 + i * 0.01),
    ),
  );
  for (const itemId of ids) {
    await db.reviewLogs.add({
      itemId,
      skillId: 'C6.major-shapes',
      drillType,
      correct: true,
      responseMs: 2000,
      rating: 3,
      hintUsed: false,
      answerGiven: '',
      at: clock,
    });
  }
  return { scheduler, ids };
}

async function start(scheduler: ReturnType<typeof createScheduler>) {
  return SessionRunner.start({
    db,
    scheduler,
    settings: { ...DEFAULT_SETTINGS, latencyBaselineMs: 500 },
    skills: [skill('C6.major-shapes')],
    drills: DRILLS,
    now: () => due,
    rng: () => 0,
    reviewOnly: true,
  });
}

describe('D21 in a session', () => {
  it('takes its turn after D9 and D10, graded per root', async () => {
    const { scheduler } = await seed(['A'], D10_ID);
    const r = await start(scheduler);
    const cur = r.currentPrompt()!;
    expect(cur.drill.id).toBe(D21_ID);
    const p = cur.prompt as D21Prompt;
    expect(p.ask).toBe('root');
    expect(p.targets).toHaveLength(2);
    const res = await r.answer(p.targets, 4000);
    expect(res.result.correct).toBe(true);
    const logs = await db.reviewLogs.where('drillType').equals(D21_ID).toArray();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ responseMs: 2000, correct: true });
    // The chord sounds with the answer (rule 10).
    expect(res.sounds.expected.length).toBe(p.shapeNotes.length);
  });

  it('hands the item back to D9 after D21', async () => {
    const { scheduler } = await seed(['A'], D21_ID);
    const r = await start(scheduler);
    expect(r.currentPrompt()!.drill.id).toBe(D9_ID);
  });

  it('logs tapping a root of the C shape for the A shape as that confusion', async () => {
    const { scheduler } = await seed(['A'], D10_ID);
    const r = await start(scheduler);
    const p = r.currentPrompt()!.prompt as D21Prompt;
    expect(p.partner?.shape).toBe('C');
    const res = await r.answer([p.partner!.targets[0]!], 900);
    expect(res.result).toMatchObject({ correct: false, confusedWith: 'caged:C' });
    const [confusion] = await db.confusions.toArray();
    expect([confusion?.a, confusion?.b].sort()).toEqual(['caged:A', 'caged:C']);
  });
});
