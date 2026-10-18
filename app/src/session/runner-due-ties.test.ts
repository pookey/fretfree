import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Rating } from 'ts-fsrs';
import { DEFAULT_SETTINGS, SKILLS, createScheduler, type Skill } from '../engine';
import { getDrill } from '../drills/registry';
import type { AnyDrillType } from '../drills/types';
import { FretworkDB } from '../storage';
import { SessionRunner } from './runner';

/** M2-17: tied due reviews alternate drills by the drill that will actually serve them. */

let db: FretworkDB;
let n = 0;
const clock = new Date('2026-10-18T09:00:00Z');
const DAY = 86_400_000;
const string6 = SKILLS.find((s) => s.id === 'F2.string6-naturals')!;
const D1 = getDrill('name-the-note')!;
// A stand-in for a second drill on the same items (e.g. a future mic drill).
const echo: AnyDrillType = { ...D1, id: 'echo' };

const skill = (id: string, itemId: string, drillTypes: string[]): Skill => ({
  ...string6,
  id,
  drillTypes,
  items: () => [{ id: itemId, skillId: id }],
});

beforeEach(() => {
  db = new FretworkDB(`due-ties-${n++}`);
});

afterEach(async () => {
  await db.delete();
});

describe('tied due reviews in a session', () => {
  it('key a two-drill item to the drill it will be served by', async () => {
    // `x` can be served by D1 or echo, and D1 served it last, so echo is next.
    const skills = [
      skill('S.x', 'note@s6f1', ['name-the-note', 'echo']),
      skill('S.y', 'note@s6f3', ['name-the-note']),
      skill('S.w', 'note@s6f5', ['echo']),
    ];
    const scheduler = createScheduler({ enableFuzz: false });
    const placedAt = new Date(clock.getTime() - 12 * DAY);
    await db.cards.bulkPut(skills.map((s) => scheduler.seedKnownCard(s.items()[0]!, placedAt)));
    await db.reviewLogs.add({
      itemId: 'note@s6f1',
      skillId: 'S.x',
      drillType: 'name-the-note',
      correct: true,
      responseMs: 900,
      rating: Rating.Good,
      hintUsed: false,
      answerGiven: 'F',
      at: placedAt,
    });

    const r = await SessionRunner.start({
      db,
      scheduler,
      settings: { ...DEFAULT_SETTINGS, latencyBaselineMs: 500 },
      skills,
      drills: [D1, echo],
      now: () => clock,
      // Near 1, the shuffle keeps item-ID order: x, y, w.
      rng: () => 0.999,
      maxItems: 3,
    });
    const served: string[] = [];
    while (!r.isOver) {
      served.push(r.currentPrompt()!.drill.id);
      r.next();
    }
    // Keyed to D1, `x` would be followed by echo-only `w` and serve echo, echo, D1.
    expect(served).toEqual(['echo', 'name-the-note', 'echo']);
  });
});
