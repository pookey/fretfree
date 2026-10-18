import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, SKILLS, createScheduler, parseNoteItemId, type Skill } from '../engine';
import { DRILLS } from '../drills/registry';
import { FretworkDB, putSkillState } from '../storage';
import { noteAt } from '../theory';
import { SessionRunner, type RunnerDeps } from './runner';

// Focused sessions (design §7): the runner serves only the focus, planned as usual.

let db: FretworkDB;
let n = 0;
let clock: Date;
const scheduler = createScheduler({ enableFuzz: false });
const D1 = DRILLS.filter((d) => d.id === 'name-the-note');
const deps = (over: Partial<RunnerDeps> = {}): RunnerDeps => ({
  db,
  scheduler,
  settings: { ...DEFAULT_SETTINGS, latencyBaselineMs: 500 },
  skills: SKILLS,
  drills: D1,
  now: () => clock,
  maxItems: 20,
  ...over,
});

const skill = (id: string) => SKILLS.find((s) => s.id === id) as Skill;
const notes = (id: string) =>
  skill(id)
    .items()
    .filter((i) => parseNoteItemId(i.id));

/** Every planned entry, walking the queue without answering. */
function plan(r: SessionRunner) {
  return Array.from({ length: r.length }, () => {
    const entry = r.currentPrompt()!.entry;
    r.next();
    return entry;
  });
}

beforeEach(() => {
  db = new FretworkDB(`runner-focus-${n++}`);
  clock = new Date('2026-10-18T09:00:00Z');
});

afterEach(async () => {
  await db.delete();
});

describe('focused sessions', () => {
  it('serves only the focused items, due ones by lowest retrievability first', async () => {
    const old = new Date('2026-09-01T09:00:00Z');
    const [a, b, c] = notes('F2.string5-naturals');
    // Lower stability → lower retrievability now → served first.
    await db.cards.bulkPut([
      scheduler.seedKnownCard(a!, old, 10),
      scheduler.seedKnownCard(b!, old, 1),
      scheduler.seedKnownCard(c!, old, 4),
      ...notes('F2.string6-naturals').map((i) => scheduler.seedKnownCard(i, old, 1)),
    ]);

    const focused = plan(
      await SessionRunner.start(deps({ focus: { skillIds: [], itemIds: [a!.id, b!.id, c!.id] } })),
    );
    expect(focused.map((e) => e.itemId)).toEqual([b!.id, c!.id, a!.id]);
    expect(focused.every((e) => e.kind === 'review')).toBe(true);

    // Without the focus the same learner gets string 6 too.
    const all = plan(await SessionRunner.start(deps()));
    expect(all.some((e) => e.skillId === 'F2.string6-naturals')).toBe(true);
  });

  it('interleaves new blocks with due reviews inside a skill focus', async () => {
    const old = new Date('2026-09-01T09:00:00Z');
    const string6 = notes('F2.string6-naturals');
    await db.cards.bulkPut(string6.slice(0, 6).map((i) => scheduler.seedKnownCard(i, old, 2)));
    await db.cards.bulkPut(
      notes('F2.string5-naturals').map((i) => scheduler.seedKnownCard(i, old, 2)),
    );

    const entries = plan(
      await SessionRunner.start(
        deps({ focus: { skillIds: ['F2.string6-naturals'], itemIds: [] } }),
      ),
    );
    expect(entries.every((e) => e.skillId === 'F2.string6-naturals')).toBe(true);
    const kinds = entries.map((e) => e.kind);
    // A warm-up review, then the new block, then more reviews.
    expect(kinds[0]).toBe('review');
    const firstNew = kinds.indexOf('new');
    expect(firstNew).toBeGreaterThan(0);
    expect(kinds.lastIndexOf('review')).toBeGreaterThan(firstNew);
    expect(new Set(entries.filter((e) => e.kind === 'new').map((e) => e.itemId))).toEqual(
      new Set(string6.slice(6).map((i) => i.id)),
    );
  });

  it('plans again from the focus when the queue runs dry', async () => {
    // Stable cards that come due two minutes in, on both strings, and two new items in focus.
    const old = new Date('2026-09-01T09:00:00Z');
    const soon = new Date(clock.getTime() + 2 * 60_000);
    const string5 = notes('F2.string5-naturals');
    const comingDue = (i: { id: string; skillId: string }) => {
      const card = scheduler.seedKnownCard(i, old, 30);
      return { ...card, fsrs: { ...card.fsrs, due: soon } };
    };
    await db.cards.bulkPut([
      ...string5.slice(2).map(comingDue),
      ...notes('F2.string6-naturals').map(comingDue),
    ]);
    const focused = deps({
      settings: { ...DEFAULT_SETTINGS, latencyBaselineMs: 500, sessionMinutes: 5 },
      focus: { skillIds: ['F2.string5-naturals'], itemIds: [] },
      maxItems: undefined,
    });
    // At the start only the new items are ready.
    const firstPlan = plan(await SessionRunner.start(focused));
    expect(new Set(firstPlan.map((e) => e.kind))).toEqual(new Set(['new']));
    const r = await SessionRunner.start(focused);
    const served: { itemId: string; skillId: string }[] = [];
    for (let i = 0; i < 200 && !r.isOver; i++) {
      const cur = r.currentPrompt()!;
      served.push(cur.entry);
      await r.answer(noteAt(parseNoteItemId(cur.entry.itemId)!).pc, 900);
      clock = new Date(clock.getTime() + 20_000);
      r.next();
    }
    expect(r.isOver).toBe(true);
    // The re-plan picked up the cards that came due, and only string 5's.
    expect(served.some((e) => e.itemId === string5[2]!.id)).toBe(true);
    expect(new Set(served.map((e) => e.skillId))).toEqual(new Set(['F2.string5-naturals']));
  });

  it('keeps gating on: a locked skill serves nothing until its prerequisites progress', async () => {
    const focus = { skillIds: ['C1.octaves'], itemIds: [] };
    const locked = await SessionRunner.start(deps({ drills: DRILLS, focus }));
    expect(locked.isEmpty).toBe(true);

    for (const skillId of ['F2.string6-naturals', 'F2.string5-naturals']) {
      await putSkillState(db, { skillId, status: 'practising', guideLevel: 3, rollingAccuracy: 0 });
    }
    const open = plan(await SessionRunner.start(deps({ drills: DRILLS, focus })));
    expect(open.length).toBeGreaterThan(0);
    expect(new Set(open.map((e) => e.skillId))).toEqual(new Set(['C1.octaves']));
  });

  it('never drills stable cards that are not due, even on a mastered focus', async () => {
    const yesterday = new Date(clock.getTime() - 86_400_000);
    const s6 = skill('F2.string6-naturals');
    await db.cards.bulkPut(s6.items().map((i) => scheduler.seedKnownCard(i, yesterday, 30)));
    await putSkillState(db, {
      skillId: s6.id,
      status: 'mastered',
      guideLevel: 0,
      rollingAccuracy: 1,
    });
    const r = await SessionRunner.start(
      deps({ drills: DRILLS, focus: { skillIds: [s6.id], itemIds: [] } }),
    );
    expect(r.isEmpty).toBe(true);
  });
});
