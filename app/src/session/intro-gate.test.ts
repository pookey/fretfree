import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SKILLS, createScheduler, type SessionEntry } from '../engine';
import { FretworkDB } from '../storage';
import { SKIP_INTROS_KEY, introGate, openIntroGate } from './intro-gate';

const scheduler = createScheduler({ enableFuzz: false });
const at = new Date('2026-10-21T09:00:00Z');
const alphabet = SKILLS.find((s) => s.id === 'F1.alphabet')!;
const string6 = SKILLS.find((s) => s.id === 'F2.string6-naturals')!;
const [a1, a2] = alphabet.items();

const entry = (over: Partial<SessionEntry> & Pick<SessionEntry, 'itemId' | 'skillId'>) =>
  ({ kind: 'new', guided: true, rep: 0, ...over }) as SessionEntry;
const first = entry({ itemId: a1!.id, skillId: alphabet.id });

describe('introGate', () => {
  it('admits the first guided rep of a skill with no cards, once', () => {
    const gate = introGate([]);
    expect(gate(first)).toBe('F1.alphabet');
    // The rest of the block, the next new item and a retry: not again.
    expect(gate({ ...first, guided: false, rep: 1 })).toBeNull();
    expect(gate(entry({ itemId: a2!.id, skillId: alphabet.id }))).toBeNull();
    expect(gate({ ...first, kind: 'retry', guided: false })).toBeNull();
    // Another fresh skill gets its own.
    const s6 = entry({ itemId: string6.items()[0]!.id, skillId: string6.id });
    expect(gate(s6)).toBe('F2.string6-naturals');
  });

  it('skips a skill that had a card when the session started', () => {
    const card = scheduler.newCard(string6.items()[0]!, at);
    const gate = introGate([card]);
    expect(gate(entry({ itemId: string6.items()[1]!.id, skillId: string6.id }))).toBeNull();
    expect(gate(first)).toBe('F1.alphabet');
  });

  it('only admits a new item’s guided rep', () => {
    const gate = introGate([]);
    for (const kind of ['review', 'stretch', 'retry'] as const) {
      expect(gate({ ...first, kind }), kind).toBeNull();
    }
    expect(gate({ ...first, guided: false })).toBeNull();
    expect(gate(first)).toBe('F1.alphabet');
  });

  it('admits nothing when off', () => {
    expect(introGate([], true)(first)).toBeNull();
  });
});

describe('openIntroGate', () => {
  let db: FretworkDB;
  let n = 0;
  const storage = (value: string | null) => () => ({ getItem: () => value });

  beforeEach(() => {
    db = new FretworkDB(`intro-gate-${n++}`);
  });

  afterEach(async () => {
    await db.delete();
  });

  it('reads which skills have cards from the store', async () => {
    await db.cards.put(scheduler.newCard(a1!, at));
    const gate = await openIntroGate(db, {}, storage(null));
    expect(gate(entry({ itemId: a2!.id, skillId: alphabet.id }))).toBeNull();
    const s6 = entry({ itemId: string6.items()[0]!.id, skillId: string6.id });
    expect(gate(s6)).toBe('F2.string6-naturals');
  });

  it('introduces nothing in a review-only session', async () => {
    const gate = await openIntroGate(db, { reviewOnly: true }, storage(null));
    expect(gate(first)).toBeNull();
  });

  it('honours the e2e switch, and treats storage that throws as unset', async () => {
    expect((await openIntroGate(db, {}, storage('1')))(first)).toBeNull();
    const throwing = () => ({
      getItem: () => {
        throw new Error('blocked');
      },
    });
    expect((await openIntroGate(db, {}, throwing))(first)).toBe('F1.alphabet');
    expect(SKIP_INTROS_KEY).toBe('fretwork.e2e.skipIntros');
  });

  it('reads localStorage by default', async () => {
    // Node has no localStorage: the default reads it as unset.
    expect((await openIntroGate(db, {}))(first)).toBe('F1.alphabet');
  });
});
