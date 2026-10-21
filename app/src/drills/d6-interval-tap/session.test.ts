import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, SKILLS, createScheduler } from '../../engine';
import { FretworkDB } from '../../storage';
import { createDrillPicker } from '../../session/drill-picker';
import { SessionRunner } from '../../session/runner';
import { DRILLS } from '../registry';
import { D6_ID, type D6Prompt } from './logic';

/** D6 through the real session runner (plan → prompt → grade → FSRS → persist). */

const C3_SKILLS = SKILLS.filter((s) => s.topic === 'C3');
const DAY = 86_400_000;

let db: FretworkDB;
let n = 0;
const clock = new Date('2026-10-18T09:00:00Z');

beforeEach(async () => {
  db = new FretworkDB(`d6-session-${n++}`);
  // C3's prerequisites are done, so the first interval group is the frontier.
  await db.skillStates.bulkPut(
    ['F1.half-steps', 'F1.whole-steps', 'C1.octaves'].map((skillId) => ({
      skillId,
      status: 'mastered' as const,
      guideLevel: 0 as const,
      rollingAccuracy: 1,
    })),
  );
});

afterEach(async () => {
  await db.delete();
});

/** Every C3 skill mastered (no new items) and these items due now, oldest first. */
async function seedDue(itemIds: readonly string[]) {
  await db.skillStates.bulkPut(
    C3_SKILLS.map((s) => ({
      skillId: s.id,
      status: 'mastered' as const,
      guideLevel: 0 as const,
      rollingAccuracy: 1,
    })),
  );
  const scheduler = createScheduler({ enableFuzz: false });
  await db.cards.bulkPut(
    itemIds.map((id, i) =>
      // Earlier items were seen longer ago, so they are less retrievable and come first.
      // A week apart, so they aren't near-ties that the session builder mixes.
      scheduler.seedKnownCard(
        { id, skillId: 'C3.thirds' },
        new Date(clock.getTime() - (40 - 7 * i) * DAY),
        5,
      ),
    ),
  );
}

async function start(maxItems = 8) {
  return SessionRunner.start({
    db,
    scheduler: createScheduler({ enableFuzz: false }),
    settings: { ...DEFAULT_SETTINGS, latencyBaselineMs: 500 },
    skills: C3_SKILLS,
    drills: DRILLS,
    now: () => clock,
    rng: () => 0.5,
    maxItems,
  });
}

describe('D6 in a session', () => {
  it('is the drill the picker chooses for every C3 tap item', () => {
    const picker = createDrillPicker(SKILLS, DRILLS);
    const items = C3_SKILLS.flatMap((s) => s.items()).filter((i) => i.id.startsWith('interval:'));
    expect(items.length).toBeGreaterThan(20);
    for (const item of items) {
      expect(picker.pick(item)?.id, item.id).toBe(D6_ID);
      // Even after D6 served it last: no other drill tests the tap direction.
      expect(picker.pick(item, D6_ID)?.id, item.id).toBe(D6_ID);
    }
  });

  it('serves C3 shapes as guided worked examples, then grades taps', async () => {
    // The name-it direction (D5) is already known, so the tap items lead the
    // first new block whether or not D5 is registered.
    const scheduler = createScheduler({ enableFuzz: false });
    const names = C3_SKILLS.flatMap((s) => s.items()).filter((i) =>
      i.id.startsWith('interval-name:'),
    );
    await db.cards.bulkPut(names.map((i) => scheduler.seedKnownCard(i, clock, 30)));
    const r = await start();
    const first = r.currentPrompt()!;
    expect(first.drill.id).toBe(D6_ID);
    expect(first.entry.itemId).toBe('interval:m3@s6→s5');
    expect(first.entry.guided).toBe(true);
    const p = first.prompt as D6Prompt;
    expect(p.scope).toBe('shape');

    const res = await r.answer(p.shapeTarget, 400);
    expect(res.result).toEqual({
      correct: true,
      expected: 'a minor 3rd (m3)',
      concept: 'm3',
    });
    expect(res.sounds.expected).toHaveLength(2);
    const log = await db.reviewLogs.toArray();
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ drillType: D6_ID, correct: true });
  });

  it('records a forgotten G–B shift as a confusion with the unshifted interval', async () => {
    await seedDue(['interval:M3@s3→s2']);
    const r = await start();
    const cur = r.currentPrompt()!;
    expect(cur.entry.itemId).toBe('interval:M3@s3→s2');
    const p = cur.prompt as D6Prompt;
    const res = await r.answer({ string: 2, fret: p.shapeTarget.fret - 1 }, 900);
    expect(res.result.correct).toBe(false);
    const rows = await db.confusions.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ a: 'M3', b: 'M3 (G–B shift)', count: 1 });
  });

  it('pairs a shifted shape with an unshifted one once they are confused (rule 6)', async () => {
    const due = [
      'interval:M3@s6→s5',
      'interval:m3@s6→s5',
      'interval:m3@s5→s4',
      'interval:m3@s4→s3',
      'interval:M3@s3→s2',
    ];
    const order = async () => {
      const r = await start();
      const ids: string[] = [];
      while (!r.isOver) {
        ids.push(r.currentPrompt()!.entry.itemId);
        r.next();
      }
      return ids;
    };

    await seedDue(due);
    const plain = await order();
    expect(plain).toEqual(due);

    await db.confusions.put({ a: 'M3', b: 'M3 (G–B shift)', count: 2 });
    const paired = await order();
    const shifted = paired.indexOf('interval:M3@s3→s2');
    expect(paired[shifted - 1]).toBe('interval:M3@s6→s5');
  });
});
