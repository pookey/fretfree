import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, SKILLS, createScheduler } from '../engine';
import { DRILLS } from '../drills/registry';
import { FretworkDB } from '../storage';
import { SessionRunner } from './runner';

// The Today warm-up's review-only mode (M1-18): due reviews, nothing new.

let db: FretworkDB;
let n = 0;
const clock = new Date('2026-10-18T09:00:00Z');
const scheduler = createScheduler({ enableFuzz: false });
// A focus off F1, which has a due card of its own below.
const focus = { skillIds: SKILLS.filter((s) => s.topic !== 'F1').map((s) => s.id), itemIds: [] };
const string6 = SKILLS.find((s) => s.id === 'F2.string6-naturals')!;

beforeEach(async () => {
  db = new FretworkDB(`runner-review-only-${n++}`);
  // Two string-6 notes, seeded a while ago with a short interval: due now.
  const old = new Date('2026-10-01T09:00:00Z');
  const due = string6.items().filter((i) => i.id === 'note@s6f0' || i.id === 'note@s6f1');
  const f1 = SKILLS.find((s) => s.topic === 'F1')!.items()[0]!;
  await db.cards.bulkPut([...due, f1].map((i) => scheduler.seedKnownCard(i, old, 1)));
});

afterEach(async () => {
  await db.delete();
});

function planned(r: SessionRunner): string[] {
  return Array.from({ length: r.length }, () => {
    const cur = r.currentPrompt()!;
    r.next();
    return `${cur.entry.kind}:${cur.entry.itemId}`;
  });
}

const start = (reviewOnly?: boolean) =>
  SessionRunner.start({
    db,
    scheduler,
    settings: DEFAULT_SETTINGS,
    minutes: 2,
    skills: SKILLS,
    focus,
    drills: DRILLS,
    now: () => clock,
    maxItems: 17,
    ...(reviewOnly ? { reviewOnly } : {}),
  });

describe('SessionRunner reviewOnly', () => {
  it('takes its time budget from the minutes override', async () => {
    expect((await start(true)).endsAt).toEqual(new Date(clock.getTime() + 2 * 60_000));
  });

  it('plans only the due reviews in focus', async () => {
    expect(planned(await start(true)).sort()).toEqual(['review:note@s6f0', 'review:note@s6f1']);
  });

  it('otherwise fills the session with new items too', async () => {
    const plan = planned(await start());
    expect(plan).toEqual(expect.arrayContaining(['review:note@s6f0', 'review:note@s6f1']));
    expect(plan.some((e) => e.startsWith('new:'))).toBe(true);
  });
});
