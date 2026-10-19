import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, SKILLS, createScheduler } from '../engine';
import { getDrill } from '../drills/registry';
import type { AnyDrillType } from '../drills/types';
import { FretworkDB } from '../storage';
import { SessionRunner } from './runner';

// Drill logic loads on demand (design §10): the runner fetches it before the
// first prompt, and a failed download never breaks the session's planning.

let db: FretworkDB;
let n = 0;
const D1 = getDrill('name-the-note')!;
const NOTE_SKILLS = SKILLS.filter((s) => s.topic === 'F2');

const start = (drill: AnyDrillType) =>
  SessionRunner.start({
    db,
    scheduler: createScheduler({ enableFuzz: false }),
    settings: DEFAULT_SETTINGS,
    skills: NOTE_SKILLS,
    drills: [drill],
    now: () => new Date('2026-10-19T09:00:00Z'),
    maxItems: 4,
  });

beforeEach(() => {
  db = new FretworkDB(`runner-lazy-logic-${n++}`);
});

afterEach(async () => {
  await db.delete();
});

describe('SessionRunner with lazy drill logic', () => {
  it('loads every drill’s logic before the first prompt', async () => {
    const logic = { ...D1.logic, preload: vi.fn(() => D1.logic.preload()) };
    const r = await start({ ...D1, logic });
    expect(logic.preload).toHaveBeenCalledTimes(1);
    expect(r.currentPrompt()?.prompt).toMatchObject({ itemId: expect.any(String) });
  });

  it('plans without the logic when its download fails, leaving the prompt to the view', async () => {
    const logic: AnyDrillType['logic'] = {
      preload: () => Promise.reject(new Error('offline')),
      ready: () => false,
      get: () => {
        throw new Error('not loaded');
      },
    };
    const r = await start({ ...D1, logic });
    expect(r.length).toBe(4);
    const cur = r.currentPrompt()!;
    expect(cur.drill.id).toBe('name-the-note');
    // The view needs the same chunk, so it shows the drill's load-failed message.
    expect(cur.prompt).toBeUndefined();
    await expect(r.answer('C', 500)).rejects.toThrow('not loaded');
  });
});
