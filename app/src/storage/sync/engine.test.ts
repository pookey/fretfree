import { afterEach, describe, expect, it, vi } from 'vitest';
import { Rating, State } from 'ts-fsrs';
import { createAccountDeletion } from '../../account/delete';
import { saveAccount } from '../../account/store';
import { emptyDailyProgress } from '../../engine/gamification/daily';
import { toLocalDate } from '../../engine/gamification/local-date';
import {
  addAnswerProgress,
  finishSessionProgress,
  settleStreak,
} from '../../session/gamification-bridge';
import { FretworkDB } from '../db';
import { DEFAULT_GAMIFICATION, type GamificationRecord } from '../gamification-model';
import { logEvent, saveGamification } from '../gamification-repo';
import { getGarage, saveGarage } from '../garage-repo';
import { getGamification, recordAnswer, saveSettings } from '../repository';
import {
  SyncError,
  accountKey,
  createSyncApi,
  createSyncEngine,
  deriveGamification,
  getSyncStatus,
  installSync,
  restartSync,
  pushBatches,
  restagePulled,
  stopSync,
  subscribeSyncStatus,
  syncRound,
  type PullPage,
  type SyncApi,
  type SyncAuth,
} from './engine';
import { mergeRecords, mergeRecordSets, recordKey } from './merge';
import {
  SYNC_LIMITS,
  SYNC_TABLE_NAMES,
  canonical,
  decodeSyncRecord,
  encodeSyncRecord,
  syncId,
  toSyncData,
  type SyncRecord,
} from './model';
import type { SyncClock } from './tracking';

// --- A fake sync server ------------------------------------------------------------

const wire = (r: SyncRecord): SyncRecord =>
  decodeSyncRecord(JSON.parse(JSON.stringify(encodeSyncRecord(r))));

/**
 * The M7-03 server's semantics in memory: one record set per user (the
 * token), every change takes the next sequence number, pushes merge with the
 * stored version, and a pull serves changes after the cursor, oldest first.
 */
class FakeServer {
  readonly users = new Map<
    string,
    { seq: number; records: Map<string, { seq: number; record: SyncRecord }> }
  >();
  pageSize: number = SYNC_LIMITS.maxBatchRecords;
  maxRecordBytes = Infinity;
  /** Thrown by the next requests, while set. */
  failure: SyncError | null = null;
  pushes: SyncRecord[][] = [];
  pulls = 0;

  user(token: string) {
    let user = this.users.get(token);
    if (!user) this.users.set(token, (user = { seq: 0, records: new Map() }));
    return user;
  }

  store(token: string, records: readonly SyncRecord[]): void {
    const user = this.user(token);
    for (const incoming of mergeRecordSets(records.map(wire))) {
      const stored = user.records.get(recordKey(incoming));
      const merged = stored ? mergeRecords(stored.record, incoming) : incoming;
      if (stored && canonical(merged) === canonical(stored.record)) continue;
      user.records.set(recordKey(incoming), { seq: ++user.seq, record: merged });
    }
  }

  /** The server's live version of a record. */
  get(token: string, table: string, id: string): SyncRecord | undefined {
    return this.user(token).records.get(`${table}\u0000${id}`)?.record;
  }

  readonly api: SyncApi = {
    push: async (records, token) => {
      if (this.failure) throw this.failure;
      this.pushes.push([...records]);
      if (records.length > SYNC_LIMITS.maxBatchRecords) return 'rejected';
      if (records.some((r) => canonical(r).length > this.maxRecordBytes)) return 'rejected';
      this.store(token, records);
      return 'ok';
    },
    pull: async (cursor, token): Promise<PullPage> => {
      if (this.failure) throw this.failure;
      this.pulls++;
      const user = this.user(token);
      const from = cursor === '' ? 0 : Number(cursor);
      const after = from > user.seq ? 0 : from;
      const changed = [...user.records.values()]
        .filter((r) => r.seq > after)
        .sort((a, b) => a.seq - b.seq);
      const page = changed.slice(0, this.pageSize);
      return {
        records: page.map((r) => wire(r.record)),
        cursor: String(page.at(-1)?.seq ?? after),
        more: changed.length > page.length,
      };
    },
  };
}

// --- Devices --------------------------------------------------------------------------

let n = 0;
const open: FretworkDB[] = [];

afterEach(async () => {
  vi.unstubAllGlobals();
  for (const db of open.splice(0)) await db.delete();
});

interface Device {
  db: FretworkDB;
  clock: { t: number; ids: number };
}

/** A device whose clock the test sets: it stamps sync metadata and new uids. */
function device(name: string, at: Date = day(1)): Device {
  const clock = { t: at.getTime(), ids: 0 };
  const fake: SyncClock = { now: () => clock.t, newId: () => `${name}-${clock.ids++}` };
  const db = new FretworkDB(`sync-engine-${n++}`, fake);
  open.push(db);
  return { db, clock };
}

/** 9:00 local time on the `d`th of October 2026. */
function day(d: number, hour = 9): Date {
  return new Date(2026, 9, d, hour);
}

const ACCOUNT = 'learner';

async function round(dev: Device, server: FakeServer, account = ACCOUNT) {
  return syncRound({
    db: dev.db,
    api: server.api,
    account,
    token: async () => account,
    current: () => true,
    now: () => new Date(dev.clock.t),
  });
}

const card = (itemId: string, skillId: string, at: Date) => ({
  itemId,
  skillId,
  fsrs: {
    due: new Date(at.getTime() + 86_400_000),
    stability: 1,
    difficulty: 5,
    elapsed_days: 0,
    scheduled_days: 1,
    learning_steps: 0,
    reps: 1,
    lapses: 0,
    state: State.Review,
    last_review: at,
  },
  createdAt: at,
  lastReviewedAt: at,
});

const log = (itemId: string, skillId: string, at: Date) => ({
  itemId,
  skillId,
  drillType: 'name-the-note',
  correct: true,
  responseMs: 1200,
  rating: Rating.Good,
  hintUsed: false,
  answerGiven: 'E',
  at,
});

/** One answered item in a session of `minutes` on `at`, as the session runner writes it. */
async function practise(dev: Device, at: Date, minutes: number, itemId = 'note@s6f0') {
  dev.clock.t = at.getTime();
  const skillId = 'F2.string6-naturals';
  const { xp } = await addAnswerProgress(dev.db, {
    itemId,
    skillId,
    correct: true,
    rating: Rating.Good,
    kind: 'new',
    stabilityDays: 0,
    answeredToday: 0,
    minutes,
    at,
  });
  await recordAnswer(dev.db, { card: card(itemId, skillId, at), log: log(itemId, skillId, at) });
  await finishSessionProgress(dev.db, {
    at,
    minutes: 0,
    sessionMinutes: minutes,
    xp,
    itemsSeen: 1,
    accuracy: 1,
  });
  return xp;
}

/** Every syncable row by sync ID, without device-local keys: what two devices must agree on. */
async function snapshot(db: FretworkDB): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = {};
  for (const table of SYNC_TABLE_NAMES) {
    const rows = (await db.table(table).toArray()) as Record<string, unknown>[];
    out[table] = rows.map((row) => canonical([syncId(table, row), toSyncData(table, row)])).sort();
  }
  return out;
}

/** Sync each device in turn until a full pass changes nothing. */
async function converge(server: FakeServer, ...devices: Device[]) {
  for (let pass = 0; pass < 4; pass++) for (const d of devices) await round(d, server);
}

// --- The API client -----------------------------------------------------------------

describe('createSyncApi', () => {
  const record: SyncRecord = {
    table: 'settings',
    id: 'singleton',
    updatedAt: 5,
    deleted: false,
    data: { sessionMinutes: 10, at: new Date('2026-10-20T09:00:00Z') },
    fields: { sessionMinutes: 5 },
  };

  function fetching(...replies: (Response | Error)[]) {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchFn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      const reply = replies.shift() ?? new Response('{}', { status: 200 });
      if (reply instanceof Error) throw reply;
      return reply;
    });
    return { api: createSyncApi('https://api.example', fetchFn as typeof fetch), calls };
  }

  const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers });

  it('pushes the wire form with a bearer token and no credentials', async () => {
    const { api, calls } = fetching(json(200, { ok: true }));
    await expect(api.push([record], 'tok')).resolves.toBe('ok');
    const [call] = calls;
    expect(call?.url).toBe('https://api.example/sync/push');
    expect(call?.init.method).toBe('POST');
    expect(call?.init.credentials).toBe('omit');
    // A stalled request gives up, so it can't hold the round's lock.
    expect(call?.init.signal).toBeInstanceOf(AbortSignal);
    expect(call?.init.headers).toMatchObject({ authorization: 'Bearer tok' });
    expect(JSON.parse(call?.init.body as string)).toEqual({ records: [encodeSyncRecord(record)] });
  });

  it('reports a refused batch (400, 413) apart from every other failure', async () => {
    const { api } = fetching(
      json(413, { error: 'record-too-large' }),
      json(400, { error: 'invalid-record' }),
      json(401, { error: 'unauthorized' }),
      json(410, { error: 'account-closing' }),
      json(503, { error: 'busy' }, { 'retry-after': '2' }),
      json(500, {}),
      new TypeError('Failed to fetch'),
    );
    await expect(api.push([record], 't')).resolves.toBe('rejected');
    await expect(api.push([record], 't')).resolves.toBe('rejected');
    const failure = async () => {
      const error = await api.push([record], 't').catch((e: unknown) => e);
      expect(error).toBeInstanceOf(SyncError);
      return error as SyncError;
    };
    expect((await failure()).failure).toBe('unauthorized');
    expect((await failure()).failure).toBe('closing');
    const busy = await failure();
    expect([busy.failure, busy.retryAfterMs]).toEqual(['busy', 2000]);
    expect((await failure()).failure).toBe('server');
    expect((await failure()).failure).toBe('offline');
  });

  it('pulls a page after the cursor, decoding dates and skipping records it cannot read', async () => {
    const { api, calls } = fetching(
      json(200, {
        records: [encodeSyncRecord(record), { table: 'nope', id: 'x' }],
        cursor: '7',
        more: true,
      }),
    );
    const page = await api.pull('3', 'tok');
    expect(calls[0]?.url).toBe(
      `https://api.example/sync/pull?cursor=3&limit=${SYNC_LIMITS.maxBatchRecords}`,
    );
    expect(page).toEqual({ records: [record], cursor: '7', more: true });
  });

  it('counts a pull that times out mid-body as offline', async () => {
    const stalled = {
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => {
        throw new DOMException('The operation timed out.', 'TimeoutError');
      },
    } as unknown as Response;
    const { api } = fetching(stalled);
    await expect(api.pull('', 't')).rejects.toMatchObject({ failure: 'offline' });
  });

  it('treats a pull reply it cannot read as a server failure', async () => {
    const { api } = fetching(
      json(200, { records: 'no', cursor: 1 }),
      new Response('not json', { status: 200 }),
      json(502, {}),
    );
    for (let i = 0; i < 3; i++) {
      await expect(api.pull('', 't')).rejects.toMatchObject({ failure: 'server' });
    }
  });
});

describe('pushBatches', () => {
  const settings = (size: number, i = 0): SyncRecord => ({
    table: 'reviewLogs',
    id: `log-${i}`,
    updatedAt: 1,
    deleted: false,
    data: { note: 'x'.repeat(size) },
  });

  it('keeps each batch within the record and byte limits', () => {
    const many = Array.from({ length: 1201 }, (_, i) => settings(10, i));
    expect(pushBatches(many).batches.map((b) => b.length)).toEqual([500, 500, 201]);

    const big = Array.from({ length: 5 }, (_, i) => settings(300_000, i));
    const { batches } = pushBatches(big);
    expect(batches.map((b) => b.length)).toEqual([3, 2]);
    for (const b of batches) {
      expect(JSON.stringify({ records: b.map(encodeSyncRecord) }).length).toBeLessThanOrEqual(
        SYNC_LIMITS.maxBatchBytes,
      );
    }
  });

  it('sets aside a record no batch can hold', () => {
    const huge = settings(SYNC_LIMITS.maxBatchBytes);
    const { batches, oversized } = pushBatches([settings(1, 1), huge, settings(1, 2)]);
    expect(oversized).toEqual([huge]);
    expect(batches).toEqual([[settings(1, 1), settings(1, 2)]]);
  });
});

// --- Rounds ---------------------------------------------------------------------------

describe('first sign-in', () => {
  it('pushes all existing local progress and empties the outbox', async () => {
    const server = new FakeServer();
    const a = device('a');
    await saveSettings(a.db, { sessionMinutes: 15 });
    await practise(a, day(1), 6);
    await practise(a, day(2), 4, 'note@s6f1');
    const local = await snapshot(a.db);

    const result = await round(a, server);
    expect(result.pushed).toBeGreaterThan(0);
    expect(await a.db.outbox.count()).toBe(0);
    // The server holds every row this device has.
    const held = [...server.user(ACCOUNT).records.values()].filter((r) => !r.record.deleted);
    expect(held.length).toBe(Object.values(local).flat().length);
    expect(server.get(ACCOUNT, 'settings', 'singleton')?.data).toMatchObject({
      sessionMinutes: 15,
    });
    const state = await a.db.syncState.get('singleton');
    expect(state).toMatchObject({ account: ACCOUNT, lastSyncedAt: new Date(a.clock.t) });
  });

  it('merges another device’s progress already on the server, losing nothing on either side', async () => {
    const server = new FakeServer();
    const b = device('b');
    await practise(b, day(1, 8), 5, 'note@s6f3');
    await round(b, server);

    const a = device('a');
    await practise(a, day(1, 10), 5, 'note@s6f5');
    await round(a, server);

    expect(await a.db.reviewLogs.count()).toBe(2);
    expect((await a.db.cards.toArray()).map((c) => c.itemId).sort()).toEqual([
      'note@s6f3',
      'note@s6f5',
    ]);
    await converge(server, a, b);
    expect(await snapshot(a.db)).toEqual(await snapshot(b.db));
  });

  it('re-queues everything and starts the cursor afresh for a different account', async () => {
    const server = new FakeServer();
    const a = device('a');
    await practise(a, day(1), 5);
    await round(a, server, 'first');
    expect(await a.db.outbox.count()).toBe(0);

    await round(a, server, 'second');
    const first = [...server.user('first').records.keys()].sort();
    expect([...server.user('second').records.keys()].sort()).toEqual(first);
    expect((await a.db.syncState.get('singleton'))?.account).toBe('second');
  });

  it('follows a cursor the server resets, and pages through', async () => {
    const server = new FakeServer();
    server.pageSize = 2;
    const b = device('b');
    for (let i = 0; i < 4; i++) await practise(b, day(1, 8 + i), 3, `note@s6f${i}`);
    await round(b, server);

    const a = device('a');
    await a.db.syncState.put({
      key: 'singleton',
      account: ACCOUNT,
      cursor: '9999',
      lastSyncedAt: null,
    });
    const pullsBefore = server.pulls;
    await round(a, server);
    expect(await a.db.reviewLogs.count()).toBe(4);
    expect(server.pulls - pullsBefore).toBeGreaterThan(2);
  });
});

describe('two devices', () => {
  it('converge after diverging offline: every review log, the same streak and stats', async () => {
    const server = new FakeServer();
    const a = device('a');
    const b = device('b');
    // A shared start: A practised on the 1st and both synced.
    await practise(a, day(1), 12);
    await converge(server, a, b);

    // Offline on the 2nd, on both devices, each short of the goal alone.
    const xpA = await practise(a, day(2, 9), 6, 'note@s6f1');
    const xpB = await practise(b, day(2, 18), 6, 'note@s6f2');
    const before = (await getGamification(a.db)).xpTotal;
    a.clock.t = b.clock.t = day(2, 20).getTime();
    await converge(server, a, b);

    expect(await snapshot(a.db)).toEqual(await snapshot(b.db));
    expect(await a.db.reviewLogs.count()).toBe(3);
    const g = await getGamification(a.db);
    expect(g.xpTotal).toBe(before + xpB);
    expect(xpA).toBeGreaterThan(0);
    const d2 = await a.db.dailyProgress.get(toLocalDate(day(2)));
    // 6 + 6 minutes meets the 10-minute goal, so the streak runs on.
    expect(d2).toMatchObject({ minutes: 12, goalMet: true, xp: xpA + xpB });
    expect(g).toMatchObject({ streakCurrent: 2, lastGoalMetDate: toLocalDate(day(2)) });
    expect(await a.db.outbox.count()).toBe(0);
    expect(await b.db.outbox.count()).toBe(0);
  });

  it('keeps a streak a stale device broke without practising (design §3.7)', async () => {
    const server = new FakeServer();
    const a = device('a');
    const b = device('b');
    for (const d of [1, 2, 3]) await practise(a, day(d), 10, `note@s6f${d}`);
    await converge(server, a, b);
    expect((await getGamification(b.db)).streakCurrent).toBe(3);

    // A meets the goal on the 4th, offline.
    await practise(a, day(4), 10, 'note@s6f4');
    // B opens on the 5th without practising: as far as it knows the 4th was
    // missed, so its streak breaks, and its later stamp would win.
    b.clock.t = day(5).getTime();
    await settleStreak(b.db, day(5));
    expect((await getGamification(b.db)).streakCurrent).toBe(0);

    a.clock.t = day(5, 10).getTime();
    b.clock.t = day(5, 11).getTime();
    await round(b, server);
    await converge(server, a, b);
    for (const dev of [a, b]) {
      expect(await getGamification(dev.db)).toMatchObject({
        streakCurrent: 4,
        lastGoalMetDate: toLocalDate(day(4)),
        streakRepairDeadline: null,
        streakBeforeBreak: 0,
      });
    }
    expect(await snapshot(a.db)).toEqual(await snapshot(b.db));
  });

  it('syncs the Garage: purchases union by part, the build’s latest edit wins (design §3.8)', async () => {
    const server = new FakeServer();
    const a = device('a', day(1, 9));
    const b = device('b', day(1, 10));
    await a.db.garagePurchases.put({ itemId: 'body-strat', price: 100, at: day(1, 9) });
    await saveGarage(a.db, { name: 'Sunny' });
    await b.db.garagePurchases.put({ itemId: 'body-strat', price: 100, at: day(1, 10) });
    await b.db.garagePurchases.put({ itemId: 'neck-maple', price: 50, at: day(1, 10) });
    await saveGarage(b.db, { name: 'Blue' });
    await converge(server, a, b);

    for (const dev of [a, b]) {
      expect(await dev.db.garagePurchases.toArray()).toEqual([
        { itemId: 'body-strat', price: 100, at: day(1, 9) },
        { itemId: 'neck-maple', price: 50, at: day(1, 10) },
      ]);
      expect((await getGarage(dev.db)).name).toBe('Blue');
    }
    expect(server.get(ACCOUNT, 'garage', 'singleton')).toBeDefined();
  });

  it('merges random offline histories to the same state whatever the order', async () => {
    for (const order of [
      ['a', 'b', 'c'],
      ['c', 'a', 'b'],
    ] as const) {
      const server = new FakeServer();
      const devices = { a: device('a'), b: device('b'), c: device('c') };
      let item = 0;
      for (const [i, name] of (['a', 'b', 'c', 'a', 'c', 'b', 'a'] as const).entries()) {
        await practise(devices[name], day(1 + (i % 3), 8 + i), 3 + i, `note@s5f${item++}`);
      }
      await converge(server, ...order.map((k) => devices[k]));
      const [first, ...rest] = await Promise.all(order.map((k) => snapshot(devices[k].db)));
      for (const s of rest) expect(s).toEqual(first);
      expect(await devices.a.db.reviewLogs.count()).toBe(7);
    }
  });
});

// --- Refused records -------------------------------------------------------------------

describe('a record the server refuses', () => {
  it('is dropped from the outbox alone, and everything else still pushes', async () => {
    const server = new FakeServer();
    const a = device('a');
    await practise(a, day(1), 5);
    await saveSettings(a.db, { sessionMinutes: 20, mutedDrills: ['x'.repeat(3000)] } as never);
    server.maxRecordBytes = 2000;

    const result = await round(a, server);
    expect(result.dropped.map((r) => `${r.table}/${r.id}`)).toEqual(['settings/singleton']);
    expect(await a.db.outbox.count()).toBe(0);
    expect(server.get(ACCOUNT, 'settings', 'singleton')).toBeUndefined();
    expect(await a.db.reviewLogs.count()).toBe(1);
    expect([...server.user(ACCOUNT).records.keys()].some((k) => k.startsWith('reviewLogs'))).toBe(
      true,
    );
  });

  it('clears an outbox entry with nothing behind it', async () => {
    const server = new FakeServer();
    const a = device('a');
    await a.db.outbox.put({ table: 'cards', id: 'ghost', updatedAt: 1 });
    await round(a, server);
    expect(await a.db.outbox.count()).toBe(0);
  });
});

// --- Restaging -----------------------------------------------------------------------

describe('rows pulled from an older schema', () => {
  const rec = (
    table: SyncRecord['table'],
    id: string,
    data: Record<string, unknown>,
  ): SyncRecord => ({
    table,
    id,
    updatedAt: 100,
    deleted: false,
    data,
  });
  const at = new Date('2026-10-01T09:00:00Z');
  const state = (skillId: string, status = 'practising') => ({
    skillId,
    status,
    guideLevel: 1,
    rollingAccuracy: 0.8,
  });

  it('move to their stage (c5, c8, c2 in order) before they merge, and push restaged', async () => {
    const server = new FakeServer();
    server.store(ACCOUNT, [
      rec('cards', 'chord-tone:3@major', card('chord-tone:3@major', 'C5.tones-triads', at)),
      rec('reviewLogs', 'old-log', log('chord-tone:3@major', 'C5.tones-triads', at)),
      rec('cards', 'numeral:vi@key=A', card('numeral:vi@key=A', 'C8.numerals-major', at)),
      rec('cards', 'note@s1f0', card('note@s1f0', 'C2.all-notes', at)),
      rec('skillStates', 'C5.tones-triads', state('C5.tones-triads')),
    ]);
    const a = device('a');
    await round(a, server);

    const skillOf = async (itemId: string) => (await a.db.cards.get(itemId))?.skillId;
    expect(await skillOf('chord-tone:3@major')).toBe('C5.tones-thirds');
    expect(await skillOf('numeral:vi@key=A')).toBe('C8.numerals-a-e-f');
    expect(await skillOf('note@s1f0')).toBe('C2.string1-naturals');
    expect((await a.db.reviewLogs.where('uid').equals('old-log').first())?.skillId).toBe(
      'C5.tones-thirds',
    );
    // The retired skill's state is gone; its stages took it over.
    const states = (await a.db.skillStates.toArray()).map((s) => s.skillId).sort();
    expect(states).toEqual(['C5.tones-roots', 'C5.tones-thirds']);

    // The server now holds the restaged versions.
    expect(server.get(ACCOUNT, 'cards', 'chord-tone:3@major')?.data?.skillId).toBe(
      'C5.tones-thirds',
    );
    expect(server.get(ACCOUNT, 'skillStates', 'C5.tones-triads')?.deleted).toBe(true);
    expect(server.get(ACCOUNT, 'skillStates', 'C5.tones-roots')?.deleted).toBe(false);
    expect(await a.db.outbox.count()).toBe(0);

    // A second device pulls the restaged set and needs to change nothing.
    const b = device('b');
    await round(b, server);
    expect(await snapshot(b.db)).toEqual(await snapshot(a.db));
    expect(await b.db.outbox.count()).toBe(0);
  });

  it('keeps a stage state this device already has', async () => {
    const a = device('a');
    await a.db.skillStates.put(state('C5.tones-roots', 'mastered') as never);
    const { records, changed } = await restagePulled(a.db, [
      rec('skillStates', 'C5.tones-triads', state('C5.tones-triads')),
    ]);
    expect(records.map((r) => [r.id, r.deleted])).toEqual([['C5.tones-triads', true]]);
    expect(changed).toHaveLength(1);
  });

  it('leaves a current state alone when an old skill ID is still a live stage', async () => {
    // C8 stage 1 kept the old skill ID, and so did C2's last stage.
    const a = device('a');
    const pulled = [
      rec('skillStates', 'C8.numerals-major', state('C8.numerals-major', 'mastered')),
      rec('skillStates', 'C8.nashville', state('C8.nashville', 'mastered')),
      rec('skillStates', 'C2.all-notes', state('C2.all-notes', 'practising')),
    ];
    const out = await restagePulled(a.db, pulled);
    expect(out.changed).toEqual([]);
    expect(out.records).toEqual(pulled);
  });

  it('restages a live old ID’s state only alongside its own pre-split cards', async () => {
    const a = device('a');
    const out = await restagePulled(a.db, [
      rec('cards', 'numeral:vi@key=A', card('numeral:vi@key=A', 'C8.numerals-major', at)),
      rec('skillStates', 'C8.numerals-major', state('C8.numerals-major', 'mastered')),
    ]);
    expect(out.changed.map((r) => [r.table, r.id]).sort()).toEqual([
      ['cards', 'numeral:vi@key=A'],
      ['skillStates', 'C8.numerals-a-e-f'],
      ['skillStates', 'C8.numerals-other-keys'],
    ]);
  });

  it('takes a pre-split card as evidence only for its own old skill', async () => {
    // One C8 restage covers both old skills: a numerals card says nothing about Nashville.
    const a = device('a');
    const nashville = rec('skillStates', 'C8.nashville', state('C8.nashville', 'mastered'));
    const numerals = rec(
      'skillStates',
      'C8.numerals-major',
      state('C8.numerals-major', 'mastered'),
    );
    const out = await restagePulled(a.db, [
      rec('cards', 'numeral:vi@key=A', card('numeral:vi@key=A', 'C8.numerals-major', at)),
      nashville,
      numerals,
    ]);
    const ids = out.records.map((r) => r.id).sort();
    expect(ids).toContain('C8.numerals-a-e-f');
    expect(ids.filter((id) => id.startsWith('C8.nashville'))).toEqual(['C8.nashville']);
    expect(out.records).toContain(nashville);
  });

  it('doesn’t master later C8 stages when a device syncs its own stage-1 mastery', async () => {
    const server = new FakeServer();
    const a = device('a');
    await a.db.skillStates.put(state('C8.numerals-major', 'mastered') as never);
    await a.db.cards.put(card('numeral:I@key=C', 'C8.numerals-major', at) as never);
    await converge(server, a);
    const states = (await a.db.skillStates.toArray()).map((s) => s.skillId);
    expect(states).toEqual(['C8.numerals-major']);
    expect(server.get(ACCOUNT, 'skillStates', 'C8.numerals-a-e-f')).toBeUndefined();
    expect(server.get(ACCOUNT, 'skillStates', 'C8.numerals-other-keys')).toBeUndefined();
  });

  it('passes current rows, tombstones and other tables through untouched', async () => {
    const a = device('a');
    const current = [
      rec('cards', 'note@s6f0', card('note@s6f0', 'F2.string6-naturals', at)),
      { ...rec('cards', 'gone', {}), deleted: true, data: null },
      rec('settings', 'singleton', { sessionMinutes: 5 }),
    ];
    const out = await restagePulled(a.db, current);
    expect(out.records).toEqual(current);
    expect(out.changed).toEqual([]);
    expect((await restagePulled(a.db, [current[2]!])).records).toEqual([current[2]]);
  });
});

// --- Derivation -----------------------------------------------------------------------

describe('deriveGamification', () => {
  const D = (d: number) => toLocalDate(day(d));
  const met = (d: number, minutes = 10) => ({
    ...emptyDailyProgress(D(d)),
    minutes,
    xp: 20,
    goalMet: true,
  });
  const base: GamificationRecord = { ...DEFAULT_GAMIFICATION };

  it('changes nothing that is already derived', () => {
    const settled = deriveGamification({ state: base, days: [met(1)], events: [], today: D(2) });
    const again = deriveGamification({
      state: settled.state,
      days: [met(1)],
      events: [],
      today: D(2),
    });
    expect(again.state).toBe(settled.state);
    expect(again.days).toEqual([]);
  });

  it('gives back a freeze spent on a day another device practised', () => {
    // Two weeks of goals earns a freeze at day 7; B spent it on day 15, which A practised.
    const days = Array.from({ length: 15 }, (_, i) => met(i + 1));
    days[14] = { ...days[14]!, freezeUsed: true };
    const stale: GamificationRecord = {
      ...base,
      streakCurrent: 14,
      streakLongest: 14,
      lastGoalMetDate: D(14),
      freezesHeld: 0,
    };
    const out = deriveGamification({ state: stale, days, events: [], today: D(16) });
    expect(out.state).toMatchObject({ streakCurrent: 15, freezesHeld: 2 });
  });

  it('keeps a streak the days can’t explain rather than lowering it', () => {
    const legacy: GamificationRecord = {
      ...base,
      streakCurrent: 9,
      streakLongest: 9,
      lastGoalMetDate: D(3),
    };
    const out = deriveGamification({ state: legacy, days: [met(3)], events: [], today: D(4) });
    expect(out.state.streakCurrent).toBe(9);
  });

  it('records the freeze a replay spends, and logs quests on their day', () => {
    // Goals on 1–7 earn a freeze; the 8th is missed and covered.
    const days = Array.from({ length: 7 }, (_, i) => met(i + 1));
    const out = deriveGamification({
      state: base,
      days,
      events: [
        { type: 'quest-completed', at: day(9), data: { date: D(9), questId: 'clear-due', xp: 15 } },
        { type: 'answer', at: new Date(Number.NaN), data: { xp: 3 } },
        { type: 'goal-met', at: day(9), data: { date: 'not a date' } },
      ],
      today: D(9),
    });
    expect(out.state).toMatchObject({ streakCurrent: 7, freezesHeld: 0, xpTotal: 18 });
    expect(out.days.find((d) => d.date === D(8))?.freezeUsed).toBe(true);
    expect(out.days.find((d) => d.date === D(9))).toMatchObject({
      xp: 15,
      questsCompleted: ['clear-due'],
    });
  });
});

// --- The engine ------------------------------------------------------------------------

describe('createSyncEngine', () => {
  const timing = { debounceMs: 5, retryMs: 10, maxRetryMs: 40 };

  function engineFor(server: FakeServer, dev = device('a'), opts: { online?: () => boolean } = {}) {
    let account: string | null = ACCOUNT;
    const auth: SyncAuth & { signOut: ReturnType<typeof vi.fn> } = {
      account: () => account,
      token: async () => account,
      signOut: vi.fn(async () => {
        account = null;
      }),
    };
    const statuses: string[] = [];
    const engine = createSyncEngine({
      db: dev.db,
      api: server.api,
      auth,
      now: () => new Date(dev.clock.t),
      isOnline: opts.online,
      onStatus: (s) => statuses.push(s.phase),
      timing,
    });
    return {
      engine,
      auth,
      statuses,
      dev,
      signOut: () => {
        account = null;
      },
    };
  }

  const until = async (check: () => boolean | Promise<boolean>) => {
    for (let i = 0; i < 200 && !(await check()); i++) await new Promise((r) => setTimeout(r, 5));
    expect(await check()).toBe(true);
  };

  it('says it is syncing as soon as a signed-in learner asks', async () => {
    const server = new FakeServer();
    const ctx = engineFor(server);
    ctx.signOut();
    await ctx.engine.syncNow();
    expect(ctx.engine.status().phase).toBe('off');
    ctx.auth.account = () => ACCOUNT;
    ctx.engine.request();
    expect(ctx.engine.status().phase).toBe('syncing');
    ctx.engine.stop();
  });

  it('syncs on request and reports when', async () => {
    const server = new FakeServer();
    const { engine, statuses, dev } = engineFor(server);
    await practise(dev, day(1), 5);
    expect(engine.status().phase).toBe('syncing');
    engine.request();
    engine.request();
    await until(() => engine.status().phase === 'synced');
    expect(engine.status().lastSyncedAt).toEqual(new Date(dev.clock.t));
    expect(server.pulls).toBe(1);
    expect(statuses.at(-1)).toBe('synced');
    engine.stop();
  });

  it('reports offline, then catches up once the server is back', async () => {
    const server = new FakeServer();
    server.failure = new SyncError('offline');
    const { engine } = engineFor(server);
    await engine.syncNow();
    expect(engine.status().phase).toBe('offline');
    server.failure = null;
    await until(() => engine.status().phase === 'synced');
    engine.stop();
  });

  it('reports an error and retries after the server’s wait when busy', async () => {
    const server = new FakeServer();
    server.failure = new SyncError('busy', 15);
    const { engine } = engineFor(server);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await engine.syncNow();
    expect(engine.status().phase).toBe('error');
    server.failure = null;
    await until(() => engine.status().phase === 'synced');

    server.failure = new Error('boom') as SyncError;
    await engine.syncNow();
    expect(engine.status().phase).toBe('error');
    expect(spy).toHaveBeenCalled();
    engine.stop();
    spy.mockRestore();
  });

  it('waits for the network when the device says it is offline', async () => {
    const server = new FakeServer();
    let online = false;
    const { engine } = engineFor(server, device('a'), { online: () => online });
    await engine.syncNow();
    expect(engine.status().phase).toBe('offline');
    expect(server.pulls).toBe(0);
    online = true;
    await engine.syncNow();
    expect(engine.status().phase).toBe('synced');
    engine.offline();
    expect(engine.status().phase).toBe('offline');
    engine.stop();
  });

  it('signs out locally when the account is closing, and keeps local data', async () => {
    const server = new FakeServer();
    const { engine, auth, dev } = engineFor(server);
    await practise(dev, day(1), 5);
    server.failure = new SyncError('closing');
    await engine.syncNow();
    expect(auth.signOut).toHaveBeenCalledTimes(1);
    expect(engine.status()).toEqual({ phase: 'off', lastSyncedAt: null });
    expect(await dev.db.reviewLogs.count()).toBe(1);
    engine.stop();
  });

  it('stops a round when the learner signs out mid-way', async () => {
    const server = new FakeServer();
    const ctx = engineFor(server);
    await practise(ctx.dev, day(1), 5);
    const pull = server.api.pull;
    server.api.pull = async (cursor, token) => {
      ctx.signOut();
      return pull(cursor, token);
    };
    await ctx.engine.syncNow();
    expect(ctx.engine.status().phase).toBe('off');
    expect((await ctx.dev.db.syncState.get('singleton'))?.lastSyncedAt).toBeNull();
    // Signed out, a request does nothing.
    await ctx.engine.syncNow();
    expect(server.pulls).toBe(1);
    ctx.engine.stop();
  });

  it('says nothing about a round that fails after it was stopped', async () => {
    const server = new FakeServer();
    const { engine } = engineFor(server);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    server.api.pull = async () => {
      engine.stop();
      throw new Error('Database has been closed');
    };
    await engine.syncNow();
    expect(spy).not.toHaveBeenCalled();
    expect(engine.status().phase).toBe('syncing');
    spy.mockRestore();
  });

  it('runs one more round for a request made during a round', async () => {
    const server = new FakeServer();
    const { engine } = engineFor(server);
    const first = engine.syncNow();
    const second = engine.syncNow();
    expect(second).toBe(first);
    await first;
    expect(server.pulls).toBe(2);
    engine.stop();
    await engine.syncNow();
    expect(server.pulls).toBe(2);
  });

  it('shows the last sync from before this page load', async () => {
    const dev = device('a');
    const when = new Date('2026-10-20T08:00:00Z');
    await dev.db.syncState.put({
      key: 'singleton',
      account: ACCOUNT,
      cursor: '3',
      lastSyncedAt: when,
    });
    const { engine } = engineFor(new FakeServer(), dev);
    await until(() => engine.status().lastSyncedAt?.getTime() === when.getTime());
    engine.stop();
  });
});

// --- In the app ------------------------------------------------------------------------

describe('installSync', () => {
  /** A window that is only what `installSync` listens to. */
  function fakeWindow() {
    const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' });
    return Object.assign(new EventTarget(), {
      navigator: { onLine: true },
      document: doc,
    }) as unknown as Window & { navigator: { onLine: boolean } };
  }

  /** The fake server behind HTTP, as `createSyncApi` calls it. */
  function http(server: FakeServer) {
    const calls: string[] = [];
    const fetchFn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      calls.push(`${init?.method ?? 'GET'} ${url.pathname}`);
      const token = String((init?.headers as Record<string, string>).authorization).slice(7);
      if (url.pathname === '/sync/push') {
        const body = JSON.parse(init?.body as string) as { records: unknown[] };
        const reply = await server.api.push(body.records.map(decodeSyncRecord), token);
        return new Response('{}', { status: reply === 'ok' ? 200 : 413 });
      }
      const page = await server.api.pull(url.searchParams.get('cursor') ?? '', token);
      return new Response(
        JSON.stringify({ ...page, records: page.records.map(encodeSyncRecord) }),
        { status: 200 },
      );
    });
    vi.stubGlobal('fetch', fetchFn);
    return calls;
  }

  const signIn = (email = 'learner@example.com') =>
    saveAccount({
      email,
      tokens: { idToken: 'id', accessToken: 'access', refreshToken: 'r', expiresAt: 4e12 },
      signedInAt: 0,
    });

  afterEach(() => saveAccount(null));

  it('does nothing until sign-in, then syncs and publishes its status', async () => {
    const server = new FakeServer();
    const calls = http(server);
    const dev = device('a');
    await practise(dev, day(1), 5);
    const win = fakeWindow();
    const seen: string[] = [];
    const unsubscribe = subscribeSyncStatus(() => seen.push(getSyncStatus().phase));
    const cleanup = installSync(dev.db, win);
    await new Promise((r) => setTimeout(r, 1200));
    expect(calls).toEqual([]);
    expect(getSyncStatus().phase).toBe('off');

    signIn();
    await vi.waitFor(() => expect(getSyncStatus().phase).toBe('synced'), { timeout: 5000 });
    expect(calls).toContain('POST /sync/push');
    expect(
      server.get('access', 'reviewLogs', (await dev.db.reviewLogs.toArray())[0]!.uid!),
    ).toBeDefined();

    win.dispatchEvent(new Event('offline'));
    expect(getSyncStatus().phase).toBe('offline');
    win.navigator.onLine = true;
    win.dispatchEvent(new Event('online'));
    await vi.waitFor(() => expect(getSyncStatus().phase).toBe('synced'), { timeout: 5000 });

    // A finished session asks for a round.
    const pushes = calls.filter((c) => c === 'POST /sync/push').length;
    await practise(dev, day(1, 10), 5, 'note@s6f7');
    await vi.waitFor(
      () => expect(calls.filter((c) => c === 'POST /sync/push').length).toBeGreaterThan(pushes),
      { timeout: 5000 },
    );

    stopSync();
    cleanup();
    unsubscribe();
    expect(seen).toContain('synced');
  });

  it('stops at once for an account delete, says so, and syncs a new sign-in once it is done', async () => {
    const server = new FakeServer();
    const calls = http(server);
    const dev = device('a');
    await practise(dev, day(1), 5);
    const cleanup = installSync(dev.db, fakeWindow());
    signIn();
    await vi.waitFor(() => expect(getSyncStatus().phase).toBe('synced'), { timeout: 5000 });

    const deletion = createAccountDeletion({
      deleteAccount: async () => undefined,
      cognito: vi.fn(),
      now: Date.now,
      stopSync,
      restartSync,
      clearLocal: vi.fn(),
      finished: vi.fn(),
      wait: async () => undefined,
    });
    const done = deletion.request(true);
    // No stale "Synced 2 minutes ago" for an account that is going.
    expect(getSyncStatus()).toEqual({ phase: 'off', lastSyncedAt: null });
    await done;
    expect(deletion.status().phase).toBe('deleted');

    // Signed in again without a reload: the new account syncs, and its
    // status is its own.
    const before = calls.length;
    const signedInAt = Date.now();
    signIn('again@example.com');
    await vi.waitFor(() => expect(getSyncStatus().phase).toBe('synced'), { timeout: 5000 });
    expect(calls.length).toBeGreaterThan(before);
    expect(getSyncStatus().lastSyncedAt!.getTime()).toBeGreaterThanOrEqual(signedInAt);
    cleanup();
  });

  it('restarts only a sync that was stopped, and only once', () => {
    const cleanup = installSync(device('a').db, fakeWindow());
    restartSync();
    stopSync();
    restartSync();
    restartSync();
    cleanup();
    // Torn down: a restart after the cleanup starts nothing.
    restartSync();
    expect(getSyncStatus().phase).toBe('off');
  });

  it('names an account by its token’s sub, or else its email', () => {
    const payload = btoa(JSON.stringify({ sub: 'abc-123' })).replace(/=+$/, '');
    const account = {
      email: 'a@b.co',
      tokens: { idToken: `h.${payload}.s`, accessToken: 'x', refreshToken: 'r', expiresAt: 0 },
      signedInAt: 0,
    };
    expect(accountKey(account)).toBe('sub:abc-123');
    expect(accountKey({ ...account, tokens: { ...account.tokens, idToken: 'opaque' } })).toBe(
      'email:a@b.co',
    );
  });

  it('does nothing in a build without a sync API', async () => {
    vi.stubEnv('VITE_SYNC_API_URL', '');
    const cleanup = installSync(device('a').db, fakeWindow());
    cleanup();
    vi.unstubAllEnvs();
  });
});

// Settings and gamification writes the derivation relies on, as tracked rows.
describe('derived rows', () => {
  it('doesn’t re-derive from the echoes of its own push', async () => {
    const server = new FakeServer();
    const a = device('a');
    // An answer's XP that the total doesn't hold yet: only a derivation adds it.
    await logEvent(
      a.db,
      {
        type: 'answer',
        itemId: 'x',
        skillId: 'y',
        correct: true,
        rating: Rating.Good,
        kind: 'new',
        xp: 7,
      },
      day(1),
    );
    await round(a, server);
    expect((await getGamification(a.db)).xpTotal).toBe(0);
    // Another device's pull is news, so it derives.
    const b = device('b');
    await round(b, server);
    expect((await getGamification(b.db)).xpTotal).toBe(7);
  });

  it('re-derives only after pulling gamification records', async () => {
    const server = new FakeServer();
    const a = device('a');
    await saveGamification(a.db, { dailyGoalMinutes: 5 });
    await logEvent(
      a.db,
      { type: 'goal-met', date: toLocalDate(day(1)), minutes: 5, xp: 0 },
      day(1),
    );
    await round(a, server);
    const b = device('b');
    await round(b, server);
    expect(await b.db.dailyProgress.get(toLocalDate(day(1)))).toMatchObject({ goalMet: true });
  });
});
