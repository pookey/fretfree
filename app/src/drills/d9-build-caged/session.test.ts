import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Rating } from 'ts-fsrs';
import { DEFAULT_SETTINGS, SKILLS, createScheduler, type Skill } from '../../engine';
import { FretworkDB } from '../../storage';
import { SessionRunner } from '../../session/runner';
import { DRILLS } from '../registry';
import { D9_ID, type D9Prompt } from './logic';

/** D9 through the real session runner (plan → prompt → grade → FSRS → persist). */

const skill = (id: string) => SKILLS.find((s) => s.id === id) as Skill;

let db: FretworkDB;
let n = 0;
const clock = new Date('2026-10-18T09:00:00Z');

beforeEach(() => {
  db = new FretworkDB(`d9-session-${n++}`);
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

describe('D9 in a session', () => {
  it('serves the triad cores first, guided, graded per note', async () => {
    const cores = skill('C6.triad-cores');
    await master([...cores.prerequisites, ...(cores.softPrerequisites ?? [])]);
    const r = await SessionRunner.start({
      db,
      scheduler: createScheduler({ enableFuzz: false }),
      settings: { ...DEFAULT_SETTINGS, latencyBaselineMs: 500 },
      skills: SKILLS,
      drills: DRILLS,
      now: () => clock,
      rng: () => 0,
      maxItems: 4,
      focus: { skillIds: ['C6.triad-cores'], itemIds: [] },
    });
    const cur = r.currentPrompt()!;
    expect(cur.drill.id).toBe(D9_ID);
    expect(cur.entry).toMatchObject({ itemId: 'caged-core:C-shape@major', guided: true });
    const p = cur.prompt as D9Prompt;
    expect(p.targets).toHaveLength(3);
    const res = await r.answer(p.targets, 3 * 1000);
    expect(res.result).toEqual({ correct: true, expected: 'the C-shape triad of C' });
    // A guided rep caps the rating at Hard.
    expect(res.rating).toBe(Rating.Hard);
    const [log] = await db.reviewLogs.toArray();
    expect(log).toMatchObject({ drillType: D9_ID, responseMs: 1000, correct: true });
    expect(res.sounds.expected).toEqual(['C3', 'G3', 'C4', 'E4']);
  });

  it('logs building the C shape for the A shape as that confusion, and pairs them', async () => {
    const scheduler = createScheduler({ enableFuzz: false });
    // Three due core cards: C, G and A. Pairing pulls A in next to C (seed pair).
    const ids = ['C', 'G', 'A'].map((s) => `caged-core:${s}-shape@major`);
    await db.cards.bulkPut(
      ids.map((id, i) =>
        scheduler.seedKnownCard({ id, skillId: 'C6.triad-cores' }, clock, 1 + i * 0.01),
      ),
    );
    await master(['C6.triad-cores', ...skill('C6.triad-cores').prerequisites], 1);
    const due = new Date(clock.getTime() + 86_400_000 * 30);
    const r = await SessionRunner.start({
      db,
      scheduler,
      settings: { ...DEFAULT_SETTINGS, latencyBaselineMs: 500 },
      skills: [skill('C6.triad-cores')],
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
      const p = cur.prompt as D9Prompt;
      if (p.shape === 'A' && !confused) {
        // A note of the C shape at the same root.
        const wrong = p.partner!.notes.find(
          (n) => !p.targets.some((t) => t.string === n.string && t.fret === n.fret),
        )!;
        const res = await r.answer([wrong], 900);
        expect(res.result.confusedWith).toBe('caged:C');
        confused = true;
      } else {
        await r.answer(p.targets, 900 * p.targets.length);
      }
      r.next();
      cur = r.currentPrompt();
    }
    const c = order.indexOf(ids[0]!);
    const a = order.indexOf(ids[2]!);
    expect(Math.abs(c - a)).toBe(1);
    const [confusion] = await db.confusions.toArray();
    expect([confusion?.a, confusion?.b].sort()).toEqual(['caged:A', 'caged:C']);
  });
});
