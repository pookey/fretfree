import { liveQuery } from 'dexie';
import { syncApiUrl } from '../../account/endpoint';
import { loadAccount, subscribe, type Account } from '../../account/store';
import type { SignIn } from '../../account/flow';
import { datesToSettle, emptyDailyProgress } from '../../engine/gamification/daily';
import {
  addDays,
  isLocalDate,
  toLocalDate,
  type LocalDate,
} from '../../engine/gamification/local-date';
import { applyDay } from '../../engine/gamification/streak';
import { getSkill } from '../../engine/skills';
import { getDb, type FretworkDB } from '../db';
import { RESTAGES } from '../export-import';
import type {
  DailyProgressRecord,
  GamificationEventRecord,
  GamificationRecord,
} from '../gamification-model';
import { getGamification } from '../repository';
import {
  SYNC_LIMITS,
  SYNC_TABLE_NAMES,
  canonical,
  decodeSyncRecord,
  encodeSyncRecord,
  isDate,
  syncId,
  type SyncRecord,
  type SyncTableName,
} from './model';
import {
  OUTBOX,
  SYNC_META,
  acknowledgePushed,
  mergeIntoLocal,
  readSyncRecord,
  type OutboxRow,
  type SyncStateRow,
} from './tracking';

/**
 * The client sync engine (M7-05, docs/design/sync.md §5). A round pushes the
 * outbox, pulls to the end of the server's changes, re-derives the streak and
 * day stats from the merged logs, then pushes whatever the pull queued. It
 * runs on app start, on focus, on reconnect and after each session, always in
 * the background: screens read Dexie and never wait on the network.
 *
 * First sign-in is an ordinary round. Every local row has been in the outbox
 * since the schema v2 upgrade, and the pull merges whatever other devices
 * already gave the server, so nothing is lost on either side.
 */

export const SYNC_TIMING = {
  /** Triggers that arrive together (start, focus, a session's last writes) share one round. */
  debounceMs: 1000,
  /** The first retry after a failed round. Each failure in a row doubles it, up to the cap. */
  retryMs: 30_000,
  maxRetryMs: 15 * 60_000,
  /** Push passes in one round, so a learner editing during it can't keep it going for ever. */
  maxPushPasses: 100,
  /** A request that takes longer counts as offline, so a stalled one can't hold the round's lock. */
  requestTimeoutMs: 30_000,
} as const;

// --- The sync API ------------------------------------------------------------

/** Why a request failed, apart from a batch the server refused (`push` → `rejected`). */
export type SyncFailure =
  /** The network failed: the device is offline, or the API is unreachable. */
  | 'offline'
  /** 503 `busy`: try again after `retryAfterMs`. */
  | 'busy'
  /** 401: the token was refused. */
  | 'unauthorized'
  /** 410 `account-closing`: the account is being, or has been, deleted. */
  | 'closing'
  /** Anything else the app doesn't expect. */
  | 'server';

export class SyncError extends Error {
  constructor(
    readonly failure: SyncFailure,
    readonly retryAfterMs?: number,
    cause?: unknown,
  ) {
    super(failure, { cause });
    this.name = 'SyncError';
  }
}

export interface PullPage {
  records: SyncRecord[];
  /** Opaque: the server may hand back an earlier one (`"0"`) to serve everything again. */
  cursor: string;
  more: boolean;
}

/** The M7-03 API, with its error contract mapped to `SyncError`. */
export interface SyncApi {
  /**
   * `POST /sync/push`. `rejected` is a 400 or 413: the server refused the
   * batch itself (a record too large or malformed), so retrying it unchanged
   * can never succeed.
   */
  push(records: readonly SyncRecord[], token: string): Promise<'ok' | 'rejected'>;
  /** `GET /sync/pull`. An empty cursor means everything. */
  pull(cursor: string, token: string): Promise<PullPage>;
}

export function createSyncApi(baseUrl: string, fetchFn: typeof fetch = fetch): SyncApi {
  async function request(path: string, token: string, init: RequestInit = {}): Promise<Response> {
    let res: Response;
    try {
      res = await fetchFn(`${baseUrl}${path}`, {
        ...init,
        headers: { ...init.headers, authorization: `Bearer ${token}` },
        // As the sign-in API: no cookies and no referrer, and never a cached reply.
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        cache: 'no-store',
        signal: timeoutSignal(SYNC_TIMING.requestTimeoutMs),
      });
    } catch {
      throw new SyncError('offline');
    }
    if (res.status === 401) throw new SyncError('unauthorized');
    if (res.status === 410) throw new SyncError('closing');
    if (res.status === 503 || res.status === 429) {
      const after = Number(res.headers.get('retry-after'));
      throw new SyncError('busy', Number.isFinite(after) && after > 0 ? after * 1000 : undefined);
    }
    return res;
  }

  return {
    async push(records, token) {
      const res = await request('/sync/push', token, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: pushBody(records),
      });
      if (res.ok) return 'ok';
      if (res.status === 400 || res.status === 413) return 'rejected';
      throw new SyncError('server');
    },

    async pull(cursor, token) {
      const query = new URLSearchParams({ cursor, limit: String(SYNC_LIMITS.maxBatchRecords) });
      const res = await request(`/sync/pull?${query.toString()}`, token);
      if (!res.ok) throw new SyncError('server');
      let body: Partial<{ records: unknown; cursor: unknown; more: unknown }>;
      try {
        body = (await res.json()) as typeof body;
      } catch {
        throw new SyncError('server');
      }
      if (!Array.isArray(body.records) || typeof body.cursor !== 'string') {
        throw new SyncError('server');
      }
      const records: SyncRecord[] = [];
      for (const wire of body.records) {
        // A record this version can't read (a table from a newer app) is skipped,
        // not fatal: everything else on the page still merges.
        try {
          records.push(decodeSyncRecord(wire));
        } catch {
          continue;
        }
      }
      return { records, cursor: body.cursor, more: body.more === true };
    },
  };
}

/** Aborts after `ms`, where the browser can (Safari 16 and later). */
function timeoutSignal(ms: number): AbortSignal | undefined {
  return typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(ms) : undefined;
}

const pushBody = (records: readonly SyncRecord[]) =>
  JSON.stringify({ records: records.map(encodeSyncRecord) });

const utf8 = new TextEncoder();
const byteLength = (text: string) => utf8.encode(text).length;

/**
 * Split records into push batches of at most `maxBatchRecords` records and
 * `maxBatchBytes` bytes of body. A record that can't fit in any batch on its
 * own comes back in `oversized`.
 */
export function pushBatches(records: readonly SyncRecord[]): {
  batches: SyncRecord[][];
  oversized: SyncRecord[];
} {
  const envelope = byteLength(pushBody([]));
  const batches: SyncRecord[][] = [];
  const oversized: SyncRecord[] = [];
  let batch: SyncRecord[] = [];
  let bytes = envelope;
  for (const record of records) {
    // Each record after the first adds a comma.
    const size = byteLength(JSON.stringify(encodeSyncRecord(record))) + 1;
    if (envelope + size > SYNC_LIMITS.maxBatchBytes) {
      oversized.push(record);
      continue;
    }
    if (batch.length === SYNC_LIMITS.maxBatchRecords || bytes + size > SYNC_LIMITS.maxBatchBytes) {
      batches.push(batch);
      batch = [];
      bytes = envelope;
    }
    batch.push(record);
    bytes += size;
  }
  if (batch.length > 0) batches.push(batch);
  return { batches, oversized };
}

// --- Restaging pulled rows ----------------------------------------------------

type Row = Record<string, unknown>;
type Tables = Record<string, unknown[]>;

/**
 * Pulled rows from a device on an older schema can still name a skill that a
 * later version split into stages (`C5.tones-triads`, the C8 harmony skills,
 * `C2.all-notes`). Each restage of `RESTAGES` runs on them in schema-version
 * order, as `importData` does with an old export file, so they land on their
 * stage before they merge. A record carries no schema version, so cards and
 * logs, which say what they are, go through every restage: one leaves a
 * current row alone.
 *
 * Skill states need evidence. C8 and C2 kept their old ID as a live stage, so
 * a current `C8.numerals-major` or `C2.all-notes` state looks exactly like a
 * pre-split one. A restage changes states only when it also moved one of the
 * pulled cards or logs, or when it retired a state whose skill no longer
 * exists (`C5.tones-triads`). Otherwise restaging a learner's own current
 * state would master stages they never practised, or drop a state.
 *
 * A moved card or review log keeps its ID and gets `updatedAt + 1`, so it
 * beats the old version on the server. A retired skill's state becomes a
 * tombstone, and the stage states it stands for are added unless this device
 * already has them. Every restaged record is queued to push (`changed`), so
 * the server holds the restaged version from then on.
 *
 * A new `RESTAGES` entry whose old skill ID stays live must keep this
 * contract: its states move only on the evidence of its cards and logs.
 */
export async function restagePulled(
  db: FretworkDB,
  records: readonly SyncRecord[],
): Promise<{ records: SyncRecord[]; changed: SyncRecord[] }> {
  const live = (table: SyncTableName) =>
    records.filter(
      (r): r is SyncRecord & { data: Row } => r.table === table && !!r.data && !r.deleted,
    );
  const cards = live('cards');
  const logs = live('reviewLogs');
  const states = live('skillStates');
  const unchanged = { records: [...records], changed: [] };
  if (cards.length + logs.length + states.length === 0) return unchanged;

  const steps = await Promise.all(RESTAGES.map(([, load]) => load()));
  // The first `cards.length` cards are the pulled ones; any after them are
  // this device's, there only to say which stages the learner has started.
  const run = (tables: Tables) =>
    steps.reduce((t, step) => {
      const out = step.restageTables(t);
      const pulled = (rows: unknown[] | undefined) => (rows ?? []).slice(0, cards.length);
      const moved =
        !sameRows(pulled(t.cards), pulled(out.cards)) ||
        !sameRows(t.reviewLogs ?? [], out.reviewLogs);
      const kept = new Set(out.skillStates);
      const retired = (t.skillStates ?? []).some(
        (s) => !kept.has(s) && !getSkill(String((s as Row).skillId)),
      );
      return moved || retired ? out : { ...out, skillStates: t.skillStates ?? [] };
    }, tables);
  const input = {
    cards: cards.map((r) => r.data),
    reviewLogs: logs.map((r) => r.data),
    skillStates: states.map((r) => r.data),
  };
  const quick = run(input);
  if (Object.entries(input).every(([name, rows]) => sameRows(rows, quick[name]))) return unchanged;

  // Something moves. Run again with this device's cards, which decide which
  // stages the learner has started, and its states, which a stage keeps.
  const [localCards, localStates] = await Promise.all([
    db.cards.toArray(),
    db.skillStates.toArray(),
  ]);
  const out = run({ ...input, cards: [...input.cards, ...localCards] });
  const replaced = new Map<SyncRecord, SyncRecord>();
  const changed: SyncRecord[] = [];
  const moved = (from: SyncRecord, to: SyncRecord) => {
    replaced.set(from, to);
    changed.push(to);
  };
  const restaged = (source: (SyncRecord & { data: Row })[], rows: unknown[] | undefined) =>
    source.forEach((r, i) => {
      const row = rows?.[i];
      if (row && row !== r.data) moved(r, { ...r, data: row as Row, updatedAt: r.updatedAt + 1 });
    });
  restaged(cards, out.cards);
  restaged(logs, out.reviewLogs);

  const outStates = new Set(out.skillStates);
  for (const r of states) {
    if (!outStates.has(r.data))
      moved(r, { ...r, deleted: true, data: null, updatedAt: r.updatedAt + 1 });
  }
  const have = new Set([...localStates, ...input.skillStates].map((s) => (s as Row).skillId));
  const stamp = Math.max(...states.map((r) => r.updatedAt)) + 1;
  const added: SyncRecord[] = [];
  for (const row of out.skillStates ?? []) {
    const state = row as Row;
    if (input.skillStates.includes(state) || have.has(state.skillId)) continue;
    have.add(state.skillId);
    added.push({
      table: 'skillStates',
      id: syncId('skillStates', state),
      updatedAt: stamp,
      deleted: false,
      data: state,
    });
  }
  changed.push(...added);
  return { records: [...records.map((r) => replaced.get(r) ?? r), ...added], changed };
}

function sameRows(a: readonly unknown[], b: readonly unknown[] | undefined): boolean {
  return !!b && a.length === b.length && a.every((row, i) => row === b[i]);
}

// --- Re-deriving gamification ---------------------------------------------------

export interface DerivationInput {
  state: GamificationRecord;
  days: readonly DailyProgressRecord[];
  events: readonly GamificationEventRecord[];
  today: LocalDate;
}

export interface Derivation {
  state: GamificationRecord;
  /** Only the days that changed. */
  days: DailyProgressRecord[];
}

/** The events re-derivation reads. */
export const DERIVED_FROM = ['answer', 'quest-completed', 'session-complete', 'goal-met'] as const;

const STREAK_FIELDS = [
  'streakCurrent',
  'lastGoalMetDate',
  'freezesHeld',
  'streakRepairDeadline',
  'streakBeforeBreak',
] as const;

/**
 * XP, day stats and the streak, re-derived from merged logs after a pull
 * (docs/design/sync.md §3, Derived data). Pure; `today` comes in.
 *
 * Their merges converge but undercount: a day practised on two devices merges
 * to the larger total, not the sum, and the streak group is last-writer-wins,
 * so a stale device that opened later (and settled a day it didn't know was
 * practised) could overwrite a streak earned elsewhere. Both would punish the
 * learner (design §3.7). So:
 * - `xpTotal` is at least the sum of every logged answer's and quest's XP;
 * - each day's `xp` is at least its logged XP, and its `minutes` at least its
 *   logged sessions' minutes. A day whose combined minutes now reach the goal
 *   is met, and so is a day with a logged `goal-met`;
 * - the streak is the more generous of two settlements over the merged days:
 *   the merged state settled forward as on app open, and a replay of every
 *   day from the first goal met. The replay restores a streak a stale state
 *   broke; the forward settle keeps a streak the replay can't see (the goal or
 *   the weekend amulet changed since).
 * Every device derives the same values from the same logs, and deriving again
 * changes nothing.
 */
export function deriveGamification(input: DerivationInput): Derivation {
  const { state, today } = input;
  const logged = new Map<
    LocalDate,
    { xp: number; minutes: number; goalMet: boolean; quests: string[] }
  >();
  const on = (date: unknown) => {
    if (typeof date !== 'string' || !isLocalDate(date)) return undefined;
    let day = logged.get(date);
    if (!day) logged.set(date, (day = { xp: 0, minutes: 0, goalMet: false, quests: [] }));
    return day;
  };
  let xpTotal = 0;
  for (const event of input.events) {
    const data = event.data ?? {};
    const xp = finite(data.xp);
    if (event.type === 'answer') {
      xpTotal += xp;
      const day =
        isDate(event.at) && !Number.isNaN(event.at.getTime())
          ? on(toLocalDate(event.at))
          : undefined;
      if (day) day.xp += xp;
    } else if (event.type === 'quest-completed') {
      xpTotal += xp;
      const day = on(data.date);
      if (day) {
        day.xp += xp;
        if (typeof data.questId === 'string') day.quests.push(data.questId);
      }
    } else if (event.type === 'session-complete') {
      // On the finish date, though each answer's minutes were stored on its
      // own date: a session across midnight can lift (and meet) the later
      // day. Rare, and only ever generous.
      const day = on(data.date);
      if (day) day.minutes += finite(data.minutes);
    } else if (event.type === 'goal-met') {
      const day = on(data.date);
      if (day) day.goalMet = true;
    }
  }

  const stored = new Map(input.days.map((d) => [d.date, d]));
  const days = new Map<LocalDate, DailyProgressRecord>();
  for (const date of [...new Set([...stored.keys(), ...logged.keys()])].sort()) {
    const s = stored.get(date) ?? emptyDailyProgress(date);
    const l = logged.get(date);
    const minutes = Math.max(s.minutes, l?.minutes ?? 0);
    const quests = [...new Set([...s.questsCompleted, ...(l?.quests ?? [])])];
    days.set(date, {
      ...s,
      xp: Math.max(s.xp, l?.xp ?? 0),
      minutes,
      goalMet:
        s.goalMet || !!l?.goalMet || (minutes > s.minutes && minutes >= state.dailyGoalMinutes),
      questsCompleted: quests.length > s.questsCompleted.length ? quests.sort() : s.questsCompleted,
    });
  }

  const forward = settleForward(state, days, today);
  const replayed = replay(state, days, today);
  const best = moreGenerous(replayed.state, forward.state) ? replayed : forward;

  const next: GamificationRecord = {
    ...state,
    xpTotal: Math.max(state.xpTotal, xpTotal),
    streakLongest: Math.max(state.streakLongest, best.state.streakLongest),
  };
  for (const field of STREAK_FIELDS) Object.assign(next, { [field]: best.state[field] });

  for (const date of best.frozen) {
    const day = days.get(date) ?? emptyDailyProgress(date);
    days.set(date, { ...day, freezeUsed: true });
  }
  const changed = [...days.values()].filter((d) => {
    const before = stored.get(d.date);
    return !before || canonical(before) !== canonical(d);
  });
  return { state: canonical(next) === canonical(state) ? state : next, days: changed };
}

interface Settlement {
  state: GamificationRecord;
  /** Dates a freeze covered. */
  frozen: Set<LocalDate>;
}

/** As the app settles on open: the dates since the last goal met, then today if it is met. */
function settleForward(
  state: GamificationRecord,
  days: ReadonlyMap<LocalDate, DailyProgressRecord>,
  today: LocalDate,
): Settlement {
  let s = state;
  const frozen = new Set<LocalDate>();
  const step = (date: LocalDate, day = days.get(date)) => {
    const r = applyDay(s, day, date);
    s = r.state;
    if (r.day.freezeUsed && !day?.freezeUsed) frozen.add(date);
  };
  for (const date of datesToSettle(state, today)) step(date);
  if (days.get(today)?.goalMet) step(today);
  return { state: s, frozen };
}

/**
 * Every date from the first goal met, settled afresh. Stored freezes are set
 * aside, so a freeze one device spent on a day another device practised comes
 * back.
 */
function replay(
  state: GamificationRecord,
  days: ReadonlyMap<LocalDate, DailyProgressRecord>,
  today: LocalDate,
): Settlement {
  let s: GamificationRecord = {
    ...state,
    streakCurrent: 0,
    streakLongest: 0,
    lastGoalMetDate: null,
    freezesHeld: 0,
    streakRepairDeadline: null,
    streakBeforeBreak: 0,
  };
  const frozen = new Set<LocalDate>();
  const step = (date: LocalDate) => {
    const day = days.get(date);
    const r = applyDay(s, day && { ...day, freezeUsed: false }, date);
    s = r.state;
    if (r.day.freezeUsed && !day?.freezeUsed) frozen.add(date);
  };
  const first = [...days.values()].find((d) => d.goalMet)?.date;
  if (first !== undefined) {
    for (let date = first; date < today; date = addDays(date, 1)) step(date);
    if (days.get(today)?.goalMet) step(today);
  }
  return { state: s, frozen };
}

/** The longer streak, then more freezes, then more to win back by a repair. */
function moreGenerous(a: GamificationRecord, b: GamificationRecord): boolean {
  return (
    (a.streakCurrent - b.streakCurrent ||
      a.freezesHeld - b.freezesHeld ||
      a.streakBeforeBreak - b.streakBeforeBreak) > 0
  );
}

function finite(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * Re-derive gamification from the local (merged) logs in one transaction, and
 * store what changed. The writes are tracked, so they push like any other.
 */
export async function rederiveGamification(db: FretworkDB, now: Date): Promise<void> {
  await db.transaction(
    'rw',
    [db.gamification, db.dailyProgress, db.gamificationEvents],
    async () => {
      const [state, days, events] = await Promise.all([
        getGamification(db),
        db.dailyProgress.toArray(),
        db.gamificationEvents
          .where('type')
          .anyOf([...DERIVED_FROM])
          .toArray(),
      ]);
      const out = deriveGamification({ state, days, events, today: toLocalDate(now) });
      if (out.state !== state) await db.gamification.put({ ...out.state, key: 'singleton' });
      if (out.days.length > 0) await db.dailyProgress.bulkPut(out.days);
    },
  );
}

// --- A sync round ------------------------------------------------------------------

/** The round stopped because the learner signed out or switched account. */
export class SyncAborted extends Error {
  constructor() {
    super('aborted');
    this.name = 'SyncAborted';
  }
}

export interface RoundDeps {
  db: FretworkDB;
  api: SyncApi;
  /** The account the round syncs, as `SyncAuth.account` names it. */
  account: string;
  /** A current access token, or null once signed out. */
  token(): Promise<string | null>;
  /** False once the round's account is no longer the signed-in one. */
  current(): boolean;
  now(): Date;
}

export interface RoundResult {
  pushed: number;
  pulled: number;
  /** Records the server refused for good (too large), dropped from the outbox. */
  dropped: SyncRecord[];
}

const DERIVED_TABLES: readonly SyncTableName[] = [
  'gamification',
  'dailyProgress',
  'gamificationEvents',
];

/** One round: push, pull to the end, re-derive, push again (sync.md §5). */
export async function syncRound(deps: RoundDeps): Promise<RoundResult> {
  const { db } = deps;
  const token = async () => {
    if (!deps.current()) throw new SyncAborted();
    const t = await deps.token();
    if (!t || !deps.current()) throw new SyncAborted();
    return t;
  };
  const sync = await claim(db, deps.account);
  const result: RoundResult = { pushed: 0, pulled: 0, dropped: [] };

  await pushOutbox(deps, token, result);

  let cursor = sync.cursor ?? '';
  let derive = false;
  for (;;) {
    const page = await deps.api.pull(cursor, await token());
    if (page.records.length > 0) {
      const staged = await restagePulled(db, page.records);
      // Echoes of this device's own pushes change nothing, so they don't call
      // for a re-derivation, which reads every logged answer.
      derive ||= await changesDerived(db, staged.records);
      const queued = await mergeIntoLocal(db, staged.records);
      await requeue(db, staged.changed, queued);
      result.pulled += page.records.length;
    }
    const moved = page.cursor !== cursor;
    cursor = page.cursor;
    await saveState(deps, { cursor });
    // A page that ends nowhere new can't be followed.
    if (!page.more || !moved) break;
  }
  if (derive) await rederiveGamification(db, deps.now());

  await pushOutbox(deps, token, result);
  await saveState(deps, { lastSyncedAt: deps.now() });
  return result;
}

/** Whether any pulled record of a derived table differs from this device's version. */
async function changesDerived(db: FretworkDB, records: readonly SyncRecord[]): Promise<boolean> {
  for (const r of records) {
    if (!DERIVED_TABLES.includes(r.table)) continue;
    const local = await readSyncRecord(db, r.table, r.id);
    if (!local || canonical(local) !== canonical(r)) return true;
  }
  return false;
}

/**
 * The sync state for `account`. Another account's (or none, before the first
 * sign-in) resets the cursor and queues every record this device has had, so
 * the new account gets all of it (sync.md §5, Switching account).
 */
async function claim(db: FretworkDB, account: string): Promise<SyncStateRow> {
  return db.transaction('rw', [db.syncState, db.syncMeta, db.outbox], async () => {
    const state = await db.syncState.get('singleton');
    if (state?.account === account) return state;
    const metas = await db.syncMeta.toArray();
    await db.outbox.bulkPut(
      metas.map(({ table, id, updatedAt }): OutboxRow => ({ table, id, updatedAt })),
    );
    const fresh: SyncStateRow = { key: 'singleton', account, cursor: null, lastSyncedAt: null };
    await db.syncState.put(fresh);
    return fresh;
  });
}

async function saveState(deps: RoundDeps, patch: Partial<SyncStateRow>): Promise<void> {
  await deps.db.transaction('rw', deps.db.syncState, async () => {
    const state = await deps.db.syncState.get('singleton');
    if (state?.account !== deps.account || !deps.current()) throw new SyncAborted();
    await deps.db.syncState.put({ ...state, ...patch });
  });
}

/** Queue restaged records whose merge kept them, so the server gets the restaged version. */
async function requeue(
  db: FretworkDB,
  changed: readonly SyncRecord[],
  queued: readonly SyncRecord[],
): Promise<void> {
  const already = new Set(queued.map(key));
  const rows = changed
    .filter((r) => !already.has(key(r)))
    .map(({ table, id, updatedAt }): OutboxRow => ({ table, id, updatedAt }));
  if (rows.length > 0) await db.outbox.bulkPut(rows);
}

const key = (r: Pick<SyncRecord, 'table' | 'id'>) => `${r.table}\u0000${r.id}`;

/** Push the outbox in batches until it is empty. */
async function pushOutbox(
  deps: RoundDeps,
  token: () => Promise<string>,
  result: RoundResult,
): Promise<void> {
  for (let pass = 0; pass < SYNC_TIMING.maxPushPasses; pass++) {
    const records = await queuedRecords(deps.db, SYNC_LIMITS.maxBatchRecords);
    if (records.length === 0) return;
    const { batches, oversized } = pushBatches(records);
    for (const r of oversized) await drop(deps.db, r, result);
    for (const batch of batches) await pushBatch(deps, token, batch, result);
  }
}

/**
 * Push one batch. A refused batch is split in half until the record the
 * server can't take is alone; that one is dropped from the outbox (a 413
 * `record-too-large` would otherwise block every push after it), and the rest
 * go through.
 */
async function pushBatch(
  deps: RoundDeps,
  token: () => Promise<string>,
  batch: SyncRecord[],
  result: RoundResult,
): Promise<void> {
  const reply = await deps.api.push(batch, await token());
  if (reply === 'ok') {
    await acknowledgePushed(deps.db, batch);
    result.pushed += batch.length;
    return;
  }
  if (batch.length === 1) {
    await drop(deps.db, batch[0]!, result);
    return;
  }
  const half = Math.ceil(batch.length / 2);
  await pushBatch(deps, token, batch.slice(0, half), result);
  await pushBatch(deps, token, batch.slice(half), result);
}

async function drop(db: FretworkDB, record: SyncRecord, result: RoundResult): Promise<void> {
  // A later local change queues it again, and its next version may fit.
  await acknowledgePushed(db, [record]);
  result.dropped.push(record);
  console.warn(`Sync dropped ${record.table}/${record.id}: the server refused it`);
}

/**
 * Up to `limit` queued records as they stand now, read in one transaction so
 * each row matches its metadata. An entry with nothing behind it is cleared.
 */
async function queuedRecords(db: FretworkDB, limit: number): Promise<SyncRecord[]> {
  return db.transaction('rw', [...SYNC_TABLE_NAMES, SYNC_META, OUTBOX], async () => {
    const queued = await db.outbox.limit(limit).toArray();
    const records: SyncRecord[] = [];
    for (const q of queued) {
      const record = await readSyncRecord(db, q.table, q.id);
      if (record) records.push(record);
      else await db.outbox.delete([q.table, q.id]);
    }
    return records;
  });
}

// --- The engine --------------------------------------------------------------------

export type SyncPhase =
  /** No account: nothing syncs. */
  | 'off'
  | 'syncing'
  /** The last round finished. */
  | 'synced'
  | 'offline'
  | 'error';

export interface SyncStatus {
  phase: SyncPhase;
  /** When a round last finished for this account. */
  lastSyncedAt: Date | null;
}

export interface SyncAuth {
  /** The signed-in account's stable key, or null when signed out. */
  account(): string | null;
  /** A current access token, or null once signed out. May throw a `SyncError`. */
  token(): Promise<string | null>;
  /** Signs out on this device, keeping local data: the account is closing. */
  signOut(): Promise<void>;
}

export interface SyncEngineDeps {
  db: FretworkDB;
  api: SyncApi;
  auth: SyncAuth;
  now?: () => Date;
  isOnline?: () => boolean;
  onStatus?: (status: SyncStatus) => void;
  /** Runs a round under a lock shared by every tab, where the browser has one. */
  lock?: <T>(run: () => Promise<T>) => Promise<T>;
  timing?: { debounceMs?: number; retryMs?: number; maxRetryMs?: number };
}

export interface SyncEngine {
  /** Ask for a round soon. Requests that arrive together share one. */
  request(): void;
  /** Run a round now, or join the one running, and resolve when it ends. */
  syncNow(): Promise<void>;
  /** The device went offline: say so, and wait for a request. */
  offline(): void;
  status(): SyncStatus;
  /** Stop for good: cancel timers, and end a running round at its next step. */
  stop(): void;
}

export function createSyncEngine(deps: SyncEngineDeps): SyncEngine {
  const now = deps.now ?? (() => new Date());
  const isOnline = deps.isOnline ?? (() => true);
  const lock = deps.lock ?? ((run) => run());
  const timing = { ...SYNC_TIMING, ...deps.timing };
  let status: SyncStatus = { phase: deps.auth.account() ? 'syncing' : 'off', lastSyncedAt: null };
  let running: Promise<void> | null = null;
  let again = false;
  let stopped = false;
  let failures = 0;
  let debounce: ReturnType<typeof setTimeout> | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;

  const set = (next: Partial<SyncStatus>) => {
    const merged = { ...status, ...next };
    if (merged.phase === status.phase && merged.lastSyncedAt === status.lastSyncedAt) return;
    status = merged;
    deps.onStatus?.(status);
  };

  const later = (ms: number) => {
    clearTimeout(retry);
    retry = setTimeout(() => void syncNow(), ms);
  };

  // The last sync of the signed-in account, from before this page load.
  void deps.db.syncState
    .get('singleton')
    .then((s) => {
      const account = deps.auth.account();
      if (s?.lastSyncedAt && account && s.account === account && !status.lastSyncedAt) {
        set({ lastSyncedAt: s.lastSyncedAt });
      }
    })
    .catch(() => undefined);

  async function once(): Promise<void> {
    const account = deps.auth.account();
    if (!account) return set({ phase: 'off', lastSyncedAt: null });
    if (!isOnline()) return set({ phase: 'offline' });
    set({ phase: 'syncing' });
    try {
      await lock(() =>
        syncRound({
          db: deps.db,
          api: deps.api,
          account,
          token: () => deps.auth.token(),
          current: () => !stopped && deps.auth.account() === account,
          now,
        }),
      );
      failures = 0;
      clearTimeout(retry);
      set({ phase: 'synced', lastSyncedAt: now() });
    } catch (error) {
      // Stopped mid-round (an account delete, or the page tearing down): say nothing.
      if (stopped) return;
      if (error instanceof SyncAborted) {
        // Signed out or switched mid-round; a switch has asked for its own round.
        if (!deps.auth.account()) set({ phase: 'off', lastSyncedAt: null });
        return;
      }
      const failure = error instanceof SyncError ? error.failure : 'server';
      if (failure === 'closing') {
        // The account is gone, or going: sign out here, which ends every
        // round, and don't retry. Local progress stays.
        clearTimeout(retry);
        set({ phase: 'off', lastSyncedAt: null });
        await deps.auth.signOut().catch(() => undefined);
        return;
      }
      failures++;
      const backoff = Math.min(timing.retryMs * 2 ** (failures - 1), timing.maxRetryMs);
      if (failure === 'offline') {
        set({ phase: 'offline' });
      } else {
        if (!(error instanceof SyncError)) console.error('Sync failed', error);
        set({ phase: 'error' });
      }
      later(error instanceof SyncError && error.retryAfterMs ? error.retryAfterMs : backoff);
    }
  }

  function syncNow(): Promise<void> {
    if (stopped) return Promise.resolve();
    if (running) {
      again = true;
      return running;
    }
    running = (async () => {
      do {
        again = false;
        await once();
      } while (again && !stopped);
    })().finally(() => {
      running = null;
    });
    return running;
  }

  return {
    request() {
      if (stopped) return;
      // Signed in a moment ago: say so at once, not after the debounce.
      if (status.phase === 'off' && deps.auth.account()) set({ phase: 'syncing' });
      clearTimeout(debounce);
      debounce = setTimeout(() => void syncNow(), timing.debounceMs);
    },
    syncNow,
    offline() {
      if (deps.auth.account()) set({ phase: 'offline' });
    },
    status: () => status,
    stop() {
      stopped = true;
      clearTimeout(debounce);
      clearTimeout(retry);
    },
  };
}

// --- In the app ------------------------------------------------------------------------

let appStatus: SyncStatus = { phase: 'off', lastSyncedAt: null };
const listeners = new Set<() => void>();
let appEngine: SyncEngine | null = null;

/** The app's sync status, for the account panel. The same object until it changes. */
export function getSyncStatus(): SyncStatus {
  return appStatus;
}

export function subscribeSyncStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function publish(status: SyncStatus): void {
  appStatus = status;
  listeners.forEach((l) => l());
}

/**
 * Stop syncing on this device now, e.g. when the learner asks to delete their
 * account (M7-06): nothing more is pushed for it.
 */
export function stopSync(): void {
  appEngine?.stop();
  appEngine = null;
}

/**
 * The account's stable key: the token's `sub`, so a deleted and re-created
 * account with the same email still counts as a new one. The email if the
 * token can't be read.
 */
export function accountKey(account: Account): string {
  try {
    const payload = account.tokens.idToken.split('.')[1] ?? '';
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const sub = (JSON.parse(json) as { sub?: unknown }).sub;
    if (typeof sub === 'string' && sub !== '') return `sub:${sub}`;
  } catch {
    // Not a JWT: fall through.
  }
  return `email:${account.email}`;
}

const webLock = <T>(run: () => Promise<T>): Promise<T> =>
  typeof navigator !== 'undefined' && navigator.locks
    ? navigator.locks.request('fretwork-sync', run)
    : run();

/**
 * Sync with the signed-in account in the background: on start, on focus, on
 * reconnect, after each session and on sign-in. Does nothing in a build with
 * no sync API. Returns a cleanup function.
 */
export function installSync(db: FretworkDB = getDb(), win: Window = window): () => void {
  const url = syncApiUrl();
  if (!url) return () => undefined;
  let signIn: Promise<SignIn | null> | undefined;
  const loadSignIn = () =>
    (signIn ??= import('../../account/client')
      .then((m) => m.getSignIn())
      .catch((error: unknown) => {
        // Not cached: the next round tries to load it again.
        signIn = undefined;
        throw new SyncError('offline', undefined, error);
      }));
  const auth: SyncAuth = {
    account: () => {
      const account = loadAccount();
      return account && accountKey(account);
    },
    async token() {
      const flow = await loadSignIn();
      try {
        return (await flow?.accessToken()) ?? null;
      } catch (error) {
        // A refresh that couldn't reach Cognito is the network, not the account.
        throw new SyncError((error as Error).message === 'network' ? 'offline' : 'server');
      }
    },
    async signOut() {
      await (await loadSignIn())?.signOut();
    },
  };
  const engine = createSyncEngine({
    db,
    api: createSyncApi(url),
    auth,
    isOnline: () => win.navigator.onLine !== false,
    onStatus: publish,
    lock: webLock,
  });
  appEngine = engine;
  publish(engine.status());

  let account = auth.account();
  const unsubscribe = subscribe(() => {
    const next = auth.account();
    if (next === account) return;
    account = next;
    engine.request();
  });
  const onVisible = () => {
    if (win.document.visibilityState === 'visible') engine.request();
  };
  const request = () => engine.request();
  const offline = () => engine.offline();
  win.addEventListener('focus', request);
  win.addEventListener('online', request);
  win.addEventListener('offline', offline);
  win.document.addEventListener('visibilitychange', onVisible);

  // After each session: its `session-complete` is the last thing it writes.
  let sessions: number | undefined;
  const watch = liveQuery(() =>
    db.gamificationEvents.where('type').equals('session-complete').count(),
  ).subscribe({
    next: (count) => {
      if (sessions !== undefined && count > sessions) engine.request();
      sessions = count;
    },
    error: () => undefined,
  });

  engine.request();
  return () => {
    engine.stop();
    if (appEngine === engine) appEngine = null;
    unsubscribe();
    watch.unsubscribe();
    win.removeEventListener('focus', request);
    win.removeEventListener('online', request);
    win.removeEventListener('offline', offline);
    win.document.removeEventListener('visibilitychange', onVisible);
  };
}
