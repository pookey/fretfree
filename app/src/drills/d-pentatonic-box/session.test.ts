import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Rating } from 'ts-fsrs';
import { DEFAULT_SETTINGS, SKILLS, createScheduler, type Skill } from '../../engine';
import { FretworkDB } from '../../storage';
import { SessionRunner } from '../../session/runner';
import { chromaOf } from '../../theory';
import { DRILLS } from '../registry';
import { DPB_ID, type DpbPrompt } from './logic';
import type { DpsPrompt } from './scale';

/** The pentatonic-box drill through the real session runner (plan → prompt → grade → FSRS → persist). */

const skill = (id: string) => SKILLS.find((s) => s.id === id) as Skill;

let db: FretworkDB;
let n = 0;
const clock = new Date('2026-10-19T09:00:00Z');

beforeEach(() => {
  db = new FretworkDB(`dpb-session-${n++}`);
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

describe('pentatonic boxes in a session', () => {
  it('serves minor box 1 first, guided, graded per note', async () => {
    const s = skill('C7.minor-boxes');
    await master([...s.prerequisites, ...(s.softPrerequisites ?? [])]);
    const r = await SessionRunner.start({
      db,
      scheduler: createScheduler({ enableFuzz: false }),
      settings: { ...DEFAULT_SETTINGS, latencyBaselineMs: 500 },
      skills: SKILLS,
      drills: DRILLS,
      now: () => clock,
      rng: () => 0,
      maxItems: 4,
      focus: { skillIds: ['C7.minor-boxes'], itemIds: [] },
    });
    const cur = r.currentPrompt()!;
    expect(cur.drill.id).toBe(DPB_ID);
    expect(cur.entry).toMatchObject({ itemId: 'penta-box:1@minor', guided: true });
    const p = cur.prompt as DpbPrompt;
    expect(p.targets).toHaveLength(6);
    const res = await r.answer(p.targets, 6 * 1000);
    expect(res.result).toEqual({ correct: true, expected: 'Cm pentatonic box 1' });
    // A guided rep caps the rating at Hard.
    expect(res.rating).toBe(Rating.Hard);
    const [log] = await db.reviewLogs.toArray();
    expect(log).toMatchObject({ drillType: DPB_ID, responseMs: 1000, correct: true });
    expect(res.sounds.expected).toHaveLength(12);
  });

  it('logs finding the own root as the relative pair’s confusion, and pairs them', async () => {
    const scheduler = createScheduler({ enableFuzz: false });
    // Three due relative cards: minor 1, minor 2 and major 5. Major 5 shares
    // minor 1's fingering; once confused, pairing pulls it in next to minor 1.
    const ids = ['penta-relative:1@minor', 'penta-relative:2@minor', 'penta-relative:5@major'];
    await db.cards.bulkPut(
      ids.map((id, i) =>
        scheduler.seedKnownCard({ id, skillId: 'C7.relative' }, clock, 1 + i * 0.01),
      ),
    );
    await master(['C7.relative', ...skill('C7.relative').prerequisites], 1);
    await db.confusions.put({
      a: 'penta-relative:1@minor',
      b: 'penta-relative:5@major',
      count: 1,
      weight: 1,
      lastAt: clock,
    });
    const due = new Date(clock.getTime() + 86_400_000 * 30);
    const r = await SessionRunner.start({
      db,
      scheduler,
      settings: { ...DEFAULT_SETTINGS, latencyBaselineMs: 500 },
      skills: [skill('C7.relative')],
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
      const p = cur.prompt as DpbPrompt;
      if (cur.entry.itemId === ids[0] && !confused) {
        const own = p.boxNotes.find((b) => chromaOf(b.pc) === chromaOf(p.root))!;
        const res = await r.answer([own], 900);
        expect(res.result.confusedWith).toBe('penta-relative:5@major');
        confused = true;
      } else {
        await r.answer(p.targets, 900 * p.targets.length);
      }
      r.next();
      cur = r.currentPrompt();
    }
    expect(confused).toBe(true);
    expect(Math.abs(order.indexOf(ids[0]!) - order.indexOf(ids[2]!))).toBe(1);
    const [confusion] = await db.confusions.toArray();
    expect(confusion?.count).toBe(2);
  });

  it('serves I7 position 1 first, guided, and logs a wrong start against that run', async () => {
    await master(skill('I7.positions').prerequisites);
    const start = (skillIds: string[]) =>
      SessionRunner.start({
        db,
        scheduler: createScheduler({ enableFuzz: false }),
        settings: { ...DEFAULT_SETTINGS, latencyBaselineMs: 500 },
        skills: SKILLS,
        drills: DRILLS,
        now: () => clock,
        rng: () => 0,
        maxItems: 4,
        focus: { skillIds, itemIds: [] },
      });
    const r = await start(['I7.positions']);
    const cur = r.currentPrompt()!;
    expect(cur.drill.id).toBe(DPB_ID);
    expect(cur.entry).toMatchObject({ itemId: 'scale-position:1', guided: true });
    const p = cur.prompt as DpsPrompt;
    expect(p.mode).toBe('position');
    const res = await r.answer(p.targets, p.targets.length * 1000);
    expect(res.result).toEqual({ correct: true, expected: 'C major position 1' });
    expect(res.rating).toBe(Rating.Hard);
    expect(res.sounds.expected).toHaveLength(p.notes.length);

    await master(['I7.positions', 'I7.root-runs']);
    const runs = await start(['I7.degree-runs']);
    const run = runs.currentPrompt()!;
    expect(run.entry.itemId).toBe('scale-run:1@2');
    const q = run.prompt as DpsPrompt;
    // Start on the lowest root instead of the lowest 2nd.
    const root = q.notes.find((n) => n.degree === 1)!;
    const wrong = await runs.answer([root], 900);
    expect(wrong.result).toMatchObject({ correct: false, confusedWith: 'scale-run:1@1' });
    const [confusion] = await db.confusions.toArray();
    expect([confusion?.a, confusion?.b].sort()).toEqual(['scale-run:1@1', 'scale-run:1@2']);
  });
});
