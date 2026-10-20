import { describe, expect, it } from 'vitest';
import { mergeRecordSets } from '../../../app/src/storage/sync/merge';
import {
  canonical,
  decodeSyncRecord,
  encodeSyncRecord,
  SYNC_LIMITS,
  SYNC_TABLE_NAMES,
  type SyncRecord,
} from '../../../app/src/storage/sync/model';
import { pick, randomRecord, seeded } from '../../../app/src/storage/sync/test-records';
import type { HttpEvent } from '../shared/http';
import { createSyncHandler, type SyncDeps } from './api';
import { COUNTER_SK, SYNC_SERVER } from './config';
import { fakeDynamo, type FakeDynamoOptions, type Item } from './fake-dynamo';
import { pushRecords } from './push';
import { markClosing } from './table';

const TABLE = 'SyncTable';

function setup(options: Pick<FakeDynamoOptions, 'pageItems' | 'before'> = {}) {
  const db = fakeDynamo({
    tableName: TABLE,
    partitionKey: 'userId',
    sortKey: 'sk',
    indexes: { bySeq: 'seq' },
    ...options,
  });
  const deletedUsers: string[] = [];
  const sleeps: number[] = [];
  const deps: SyncDeps = {
    table: { call: db.call, tableName: TABLE, seqIndex: 'bySeq' },
    async deleteUser(sub) {
      db.log.push('AdminDeleteUser');
      deletedUsers.push(sub);
    },
    async sleep(ms) {
      sleeps.push(ms);
    },
    random: () => 0.5,
  };
  const handler = createSyncHandler(deps);
  const auth = (sub: string): HttpEvent => ({
    requestContext: { authorizer: { jwt: { claims: { sub } } } },
  });
  const as = (sub: string) => ({
    push: (records: SyncRecord[], extra: Record<string, unknown> = {}) =>
      handler({
        ...auth(sub),
        routeKey: 'POST /sync/push',
        body: JSON.stringify({ records: records.map(encodeSyncRecord), ...extra }),
      }),
    pushRaw: (body: string, isBase64Encoded = false) =>
      handler({ ...auth(sub), routeKey: 'POST /sync/push', body, isBase64Encoded }),
    pull: (query: Record<string, string> = {}) =>
      handler({ ...auth(sub), routeKey: 'GET /sync/pull', queryStringParameters: query }),
    deleteAccount: () => handler({ ...auth(sub), routeKey: 'DELETE /account' }),
    /** Pulls from `cursor` to the end, as the client does. */
    async pullAll(cursor = '', limit?: number) {
      const records: SyncRecord[] = [];
      for (;;) {
        const res = await this.pull({ cursor, ...(limit ? { limit: String(limit) } : {}) });
        expect(res.statusCode).toBe(200);
        const page = JSON.parse(res.body) as { records: unknown[]; cursor: string; more: boolean };
        records.push(...page.records.map(decodeSyncRecord));
        cursor = page.cursor;
        if (!page.more) return { records, cursor };
      }
    },
  });
  const itemsOf = (sub: string) =>
    [...db.items.values()].filter((item) => (item.userId as { S: string }).S === sub);
  const counterOf = (sub: string) =>
    Number(
      (itemsOf(sub).find((i) => (i.sk as { S: string }).S === COUNTER_SK)?.lastSeq as { N: string })
        ?.N ?? 0,
    );
  return { db, deps, handler, as, itemsOf, counterOf, deletedUsers, sleeps };
}

const at = (iso: string) => new Date(`2026-10-${iso}Z`);

function card(id: string, updatedAt: number, stability = 1): SyncRecord {
  return {
    table: 'cards',
    id,
    updatedAt,
    deleted: false,
    data: { itemId: id, skillId: 'F2', fsrs: { due: at('20T09:00:00'), stability } },
  };
}

function day(date: string, xp: number, minutes: number): SyncRecord {
  return {
    table: 'dailyProgress',
    id: date,
    updatedAt: 1000 + xp,
    deleted: false,
    data: { date, xp, minutes, goalMet: false, freezeUsed: false, questsCompleted: [] },
  };
}

const body = (res: { body: string }) => JSON.parse(res.body) as Record<string, unknown>;
const same = (a: readonly SyncRecord[], b: readonly SyncRecord[]) =>
  expect(mergeRecordSets(a).map(canonical)).toEqual(mergeRecordSets(b).map(canonical));

describe('sync API: auth and routing', () => {
  it('refuses a request without a token subject', async () => {
    const { handler } = setup();
    expect((await handler({ routeKey: 'GET /sync/pull' })).statusCode).toBe(401);
    const empty = { requestContext: { authorizer: { jwt: { claims: { sub: '' } } } } };
    expect((await handler({ ...empty, routeKey: 'GET /sync/pull' })).statusCode).toBe(401);
  });

  it('404s an unknown route', async () => {
    const { handler } = setup();
    const res = await handler({
      routeKey: 'GET /nope',
      requestContext: { authorizer: { jwt: { claims: { sub: 'u' } } } },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('sync API: a user reaches only their own data', () => {
  it('keeps each user to their own partition, whatever the body or query says', async () => {
    const { as, itemsOf } = setup();
    const alice = as('alice');
    const mallory = as('mallory');
    expect((await alice.push([card('c1', 1000, 5), day('2026-10-18', 40, 10)])).statusCode).toBe(
      200,
    );

    // Mallory can't see Alice's records, even naming her in the query.
    expect(body(await mallory.pull({ cursor: '', userId: 'alice', sub: 'alice' }))).toEqual({
      records: [],
      cursor: '0',
      more: false,
    });
    // Nor write to them by naming her in the body: it lands in Mallory's partition.
    await mallory.push([card('c1', 9999, 1)], { userId: 'alice', sub: 'alice' });
    expect((await alice.pullAll()).records.map((r) => r.updatedAt)).toEqual([1000, 1040]);
    expect((await mallory.pullAll()).records.map((r) => r.updatedAt)).toEqual([9999]);

    // Nor delete them.
    await mallory.deleteAccount();
    expect(itemsOf('mallory')).toEqual([]);
    expect(itemsOf('alice')).toHaveLength(3);
    expect((await alice.pullAll()).records).toHaveLength(2);
  });
});

describe('sync API: push', () => {
  it('stores a batch and serves it back in the wire format', async () => {
    const { as } = setup();
    const records = [card('c1', 1000), day('2026-10-18', 40, 10)];
    expect(body(await as('u').push(records))).toEqual({ ok: true });
    const page = body(await as('u').pull());
    expect(page.records).toEqual(mergeRecordSets(records).map(encodeSyncRecord));
    expect(page).toMatchObject({ cursor: '2', more: false });
  });

  it('is idempotent: a re-sent batch changes nothing', async () => {
    const { as, counterOf, db } = setup();
    const records = [card('c1', 1000), card('c2', 1000), day('2026-10-18', 40, 10)];
    await as('u').push(records);
    const before = structuredClone([...db.items.entries()]);
    expect(body(await as('u').push(records))).toEqual({ ok: true });
    expect([...db.items.entries()]).toEqual(before);
    expect(counterOf('u')).toBe(3);
  });

  it("merges with the server's version using each table's rule", async () => {
    const { as } = setup();
    await as('u').push([card('c1', 2000, 7), day('2026-10-18', 70, 3)]);
    // An older card loses; the day merges field by field (max xp, max minutes).
    await as('u').push([card('c1', 1000, 1), day('2026-10-18', 40, 10)]);
    const { records } = await as('u').pullAll();
    expect(records.find((r) => r.table === 'cards')).toEqual(card('c1', 2000, 7));
    expect(records.find((r) => r.table === 'dailyProgress')?.data).toMatchObject({
      xp: 70,
      minutes: 10,
    });
  });

  it('merges repeats of one record within a batch', async () => {
    const { as, counterOf } = setup();
    await as('u').push([card('c1', 1000), card('c1', 3000, 9), card('c1', 2000)]);
    expect(counterOf('u')).toBe(1);
    expect((await as('u').pullAll()).records).toEqual([card('c1', 3000, 9)]);
  });

  it('writes a large batch in transactions of the counter plus at most 99 records', async () => {
    const writes: number[] = [];
    const { as, itemsOf } = setup({
      before(op, input) {
        if (op === 'TransactWriteItems') writes.push((input.TransactItems as unknown[]).length);
      },
    });
    const records = Array.from({ length: 250 }, (_, i) => card(`c${i}`, 1000));
    expect((await as('u').push(records)).statusCode).toBe(200);
    expect(writes).toEqual([100, 100, 53]);
    const seqs = itemsOf('u')
      .flatMap((i) => (i.seq ? [Number((i.seq as { N: string }).N)] : []))
      .sort((a, b) => a - b);
    expect(seqs).toEqual(Array.from({ length: 250 }, (_, i) => i + 1));
  });

  it('refuses a malformed body or record', async () => {
    const { as } = setup();
    const u = as('u');
    expect(body(await u.pushRaw('{'))).toEqual({ error: 'invalid-body' });
    expect((await u.pushRaw('{"records":{}}')).statusCode).toBe(400);
    for (const bad of [
      { table: 'nope', id: 'x', updatedAt: 1, deleted: false, data: {} },
      { ...card('', 1) },
      { ...card('x'.repeat(SYNC_SERVER.maxIdBytes + 1), 1) },
      { ...card('c', 1), data: [] },
      { ...card('c', 1), fields: [1] },
      { ...card('c', 1), fields: { a: 'soon' } },
    ]) {
      const res = await u.pushRaw(JSON.stringify({ records: [bad] }));
      expect([res.statusCode, body(res)]).toEqual([400, { error: 'invalid-record' }]);
    }
    expect((await u.pullAll()).records).toEqual([]);
  });

  it('enforces the batch limits before writing anything', async () => {
    const { as, db } = setup();
    const u = as('u');
    const tooMany = Array.from({ length: SYNC_LIMITS.maxBatchRecords + 1 }, (_, i) =>
      card(`c${i}`, 1),
    );
    expect(body(await u.push(tooMany))).toEqual({ error: 'batch-too-large' });
    const huge = JSON.stringify({ records: [], pad: 'x'.repeat(SYNC_LIMITS.maxBatchBytes) });
    expect((await u.pushRaw(huge)).statusCode).toBe(413);
    const huge64 = Buffer.from(huge).toString('base64');
    expect((await u.pushRaw(huge64, true)).statusCode).toBe(413);
    const big = card('c1', 1);
    big.data!.notes = 'x'.repeat(SYNC_SERVER.maxRecordBytes);
    expect(body(await u.push([card('c0', 1), big]))).toEqual({ error: 'record-too-large' });
    expect(db.items.size).toBe(0);
    // A small body under base64 is fine.
    const ok = Buffer.from(JSON.stringify({ records: [] })).toString('base64');
    expect(body(await u.pushRaw(ok, true))).toEqual({ ok: true });
  });

  it('refuses a merge that outgrows an item', async () => {
    const { as } = setup();
    const quests = (prefix: string) =>
      Array.from({ length: 4000 }, (_, i) => `${prefix}-${i}-${'q'.repeat(40)}`);
    const half = (prefix: string): SyncRecord => ({
      ...day('2026-10-18', 1, 1),
      data: { date: '2026-10-18', questsCompleted: quests(prefix) },
    });
    expect((await as('u').push([half('a')])).statusCode).toBe(200);
    expect(body(await as('u').push([half('b')]))).toEqual({ error: 'record-too-large' });
  });

  it('re-reads and re-merges when a concurrent push wins the race, losing nothing', async () => {
    let armed = false;
    const env = setup({
      async before(op) {
        if (op !== 'TransactWriteItems' || !armed) return;
        armed = false;
        // Another device commits a newer version of c1 and a new c2 in between.
        await pushRecords(env.deps.table, 'u', [card('c1', 3000, 9), card('c2', 1000)], env.deps);
      },
    });
    await env.as('u').push([card('c1', 1000)]);
    armed = true;
    expect((await env.as('u').push([card('c1', 2000, 4), card('c3', 2000)])).statusCode).toBe(200);
    const { records } = await env.as('u').pullAll();
    same(records, [card('c1', 3000, 9), card('c2', 1000), card('c3', 2000)]);
    // Seq 1 (c1 v1), 2–3 (the racing push), then 4 for c3 only: c1 didn't change.
    expect(env.counterOf('u')).toBe(4);
    expect(env.sleeps).toHaveLength(1);
  });

  it('retries a snapshot read that met a write in flight', async () => {
    let conflicts = 1;
    const { as } = setup({
      before(op) {
        if (op === 'TransactGetItems' && conflicts-- > 0) {
          throw Object.assign(new Error('conflict'), { name: 'TransactionCanceledException' });
        }
      },
    });
    expect((await as('u').push([card('c1', 1000)])).statusCode).toBe(200);
  });

  it('gives up with 503 when it keeps losing races', async () => {
    const env = setup({
      async before(op, input) {
        if (op !== 'TransactWriteItems') return;
        const counter = (input.TransactItems as { Update?: { Key: Item } }[])[0]!.Update!;
        // Someone else always bumps the counter first.
        const key = `${(counter.Key.userId as { S: string }).S}\u0000${COUNTER_SK}`;
        const item = env.db.items.get(key) ?? { ...counter.Key, lastSeq: { N: '0' } };
        item.lastSeq = { N: String(Number((item.lastSeq as { N: string }).N) + 1) };
        env.db.items.set(key, item);
      },
    });
    const res = await env.as('u').push([card('c1', 1000)]);
    expect([res.statusCode, body(res), res.headers['retry-after']]).toEqual([
      503,
      { error: 'busy' },
      '1',
    ]);
    expect(env.sleeps).toHaveLength(SYNC_SERVER.maxAttempts - 1);
    expect(Math.max(...env.sleeps)).toBeLessThanOrEqual(SYNC_SERVER.maxBackoffMs);
  });

  it('passes on errors that are not contention', async () => {
    const { as } = setup({
      before(op) {
        if (op === 'TransactWriteItems') throw new Error('boom');
      },
    });
    await expect(as('u').push([card('c1', 1000)])).rejects.toThrow('boom');
    const cancelled = setup({
      before(op) {
        if (op !== 'TransactWriteItems') return;
        throw Object.assign(new Error('too big'), {
          name: 'TransactionCanceledException',
          CancellationReasons: [{ Code: 'None' }, { Code: 'ValidationError' }],
        });
      },
    });
    await expect(cancelled.as('u').push([card('c1', 1000)])).rejects.toThrow('too big');
    expect(cancelled.sleeps).toEqual([]);
  });
});

describe('sync API: pull', () => {
  it('pages oldest change first, by cursor and limit', async () => {
    const { as } = setup();
    const u = as('u');
    await u.push([card('a', 1), card('b', 1), card('c', 1)]);
    await u.push([card('a', 2)]);
    const first = body(await u.pull({ limit: '2' }));
    expect(first).toMatchObject({ cursor: '3', more: true });
    expect((first.records as SyncRecord[]).map((r) => r.id)).toEqual(['b', 'c']);
    const second = body(await u.pull({ cursor: '3', limit: '2' }));
    expect(second).toMatchObject({ cursor: '4', more: false });
    expect((second.records as SyncRecord[]).map((r) => r.id)).toEqual(['a']);
    expect(body(await u.pull({ cursor: '4' }))).toEqual({ records: [], cursor: '4', more: false });
  });

  it('follows DynamoDB pages, and caps the limit', async () => {
    const { as } = setup({ pageItems: 3 });
    const records = Array.from({ length: 600 }, (_, i) => card(`c${i}`, 1));
    await as('u').push(records.slice(0, 500));
    await as('u').push(records.slice(500));
    const page = body(await as('u').pull({ limit: '9999' }));
    expect(page).toMatchObject({ cursor: String(SYNC_LIMITS.maxBatchRecords), more: true });
    expect(page.records).toHaveLength(SYNC_LIMITS.maxBatchRecords);
    expect((await as('u').pullAll('', 7)).records).toHaveLength(600);
  });

  it('stops a page at the byte cap, but always serves one record', async () => {
    const { as } = setup();
    const big = (id: string) => ({
      ...card(id, 1),
      data: { notes: 'x'.repeat(SYNC_SERVER.maxRecordBytes - 100) },
    });
    const n = Math.ceil(SYNC_SERVER.maxPullBytes / SYNC_SERVER.maxRecordBytes) + 1;
    for (let i = 0; i < n; i++) await as('u').push([big(`c${i}`)]);
    const page = body(await as('u').pull());
    expect((page.records as unknown[]).length).toBe(n - 2);
    expect(page.more).toBe(true);
    expect((await as('u').pullAll()).records).toHaveLength(n);
  });

  it('ends a pull at the counter read when it began', async () => {
    let pushed = false;
    const env = setup({
      async before(op) {
        if (op !== 'Query' || pushed) return;
        pushed = true;
        await pushRecords(env.deps.table, 'u', [card('late', 1)], env.deps);
      },
    });
    await env.as('u').push([card('a', 1)]);
    expect(body(await env.as('u').pull())).toMatchObject({ cursor: '1', more: false });
    const next = body(await env.as('u').pull({ cursor: '1' }));
    expect((next.records as SyncRecord[]).map((r) => r.id)).toEqual(['late']);
  });

  it('serves everything again for a cursor past the counter', async () => {
    const { as } = setup();
    await as('u').push([card('a', 1)]);
    const page = body(await as('u').pull({ cursor: '50' }));
    expect(page).toMatchObject({ cursor: '1', more: false });
    expect(page.records).toHaveLength(1);
    expect(body(await as('fresh').pull({ cursor: '50' }))).toMatchObject({ cursor: '0' });
  });

  it('refuses a bad cursor or limit', async () => {
    const { as } = setup();
    for (const query of [{ cursor: 'abc' }, { cursor: '-1' }, { cursor: '1e3' }]) {
      expect(body(await as('u').pull(query))).toEqual({ error: 'invalid-cursor' });
    }
    expect(body(await as('u').pull({ cursor: '9'.repeat(20) }))).toEqual({
      error: 'invalid-cursor',
    });
    for (const limit of ['0', 'x', '1.5']) {
      expect(body(await as('u').pull({ limit }))).toEqual({ error: 'invalid-limit' });
    }
  });
});

describe('sync API: DELETE /account', () => {
  it("removes every item in the user's partition, then the Cognito user", async () => {
    const { as, itemsOf, deletedUsers, db } = setup({ pageItems: 7 });
    await as('u').push(Array.from({ length: 60 }, (_, i) => card(`c${i}`, 1)));
    await as('other').push([card('c0', 1)]);
    const start = db.log.length;
    expect(body(await as('u').deleteAccount())).toEqual({ ok: true });
    expect(itemsOf('u')).toEqual([]);
    expect(itemsOf('other')).toHaveLength(2);
    expect(deletedUsers).toEqual(['u']);
    // Mark the account closing, page through deleting records, delete the user,
    // and only then drop the counter.
    const ops = db.log.slice(start);
    expect(ops[0]).toBe('UpdateItem');
    expect(new Set(ops.slice(1, -2))).toEqual(new Set(['Query', 'BatchWriteItem']));
    expect(ops.slice(-2)).toEqual(['AdminDeleteUser', 'DeleteItem']);
  });

  it('is safe to retry after failing halfway, and blocks sync until it finishes', async () => {
    const env = setup();
    let fail = true;
    env.deps.deleteUser = async (sub) => {
      if (fail) throw new Error('cognito down');
      env.deletedUsers.push(sub);
    };
    const handler = createSyncHandler(env.deps);
    const del = () =>
      handler({
        routeKey: 'DELETE /account',
        requestContext: { authorizer: { jwt: { claims: { sub: 'u' } } } },
      });
    await env.as('u').push([card('a', 1), card('b', 1)]);
    await expect(del()).rejects.toThrow('cognito down');

    // Half done: the records are gone, the account is closing.
    expect(env.itemsOf('u')).toHaveLength(1);
    expect(body(await env.as('u').push([card('c', 1)]))).toEqual({ error: 'account-closing' });
    expect((await env.as('u').pull()).statusCode).toBe(410);

    fail = false;
    expect(body(await del())).toEqual({ ok: true });
    expect(env.itemsOf('u')).toEqual([]);
    expect(env.deletedUsers).toEqual(['u']);
    // Deleting again is harmless.
    expect(body(await del())).toEqual({ ok: true });
    expect(env.itemsOf('u')).toEqual([]);
  });

  it('fails a push already in flight when the delete starts', async () => {
    let closed = false;
    const env = setup({
      async before(op) {
        if (op !== 'TransactWriteItems' || closed) return;
        closed = true;
        await markClosing(env.deps.table, 'u');
      },
    });
    expect(body(await env.as('u').push([card('a', 1)]))).toEqual({ error: 'account-closing' });
    expect(env.itemsOf('u').filter((i) => i.seq)).toEqual([]);
  });

  it('retries the deletes DynamoDB leaves unprocessed', async () => {
    const env = setup();
    let throttled = 0;
    const call = env.deps.table.call;
    env.deps.table.call = async (op, input) => {
      if (op !== 'BatchWriteItem' || throttled >= 2) return call(op, input);
      throttled++;
      // Process the first request only; hand the rest back.
      const [table, requests] = Object.entries(input.RequestItems as Record<string, unknown[]>)[0]!;
      await call(op, { RequestItems: { [table]: requests.slice(0, 1) } });
      return { UnprocessedItems: { [table]: requests.slice(1) } };
    };
    await env.as('u').push(Array.from({ length: 30 }, (_, i) => card(`c${i}`, 1)));
    const handler = createSyncHandler(env.deps);
    const res = await handler({
      routeKey: 'DELETE /account',
      requestContext: { authorizer: { jwt: { claims: { sub: 'u' } } } },
    });
    expect(res.statusCode).toBe(200);
    expect(env.itemsOf('u')).toEqual([]);
    expect(env.sleeps.length).toBeGreaterThan(0);
  });

  it('gives up when DynamoDB keeps throttling, leaving the account closing', async () => {
    const env = setup();
    const call = env.deps.table.call;
    env.deps.table.call = async (op, input) =>
      op === 'BatchWriteItem' ? { UnprocessedItems: input.RequestItems } : call(op, input);
    await env.as('u').push([card('a', 1)]);
    const handler = createSyncHandler(env.deps);
    await expect(
      handler({
        routeKey: 'DELETE /account',
        requestContext: { authorizer: { jwt: { claims: { sub: 'u' } } } },
      }),
    ).rejects.toThrow('throttled');
    expect(env.deletedUsers).toEqual([]);
    expect((await env.as('u').pull()).statusCode).toBe(410);
  });
});

describe('sync API: convergence', () => {
  it('converges concurrent pushes from many devices, and incremental pulls miss nothing', async () => {
    let retries = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const rng = seeded(seed);
      const { as, itemsOf, counterOf, sleeps } = setup({ pageItems: 4 });
      const ids = ['a', 'b', 'c'];
      const batch = () =>
        Array.from({ length: 1 + Math.floor(rng() * 6) }, () =>
          randomRecord(pick(rng, SYNC_TABLE_NAMES), rng, pick(rng, ids)),
        );
      const batches = Array.from({ length: 9 }, batch);

      // A follower pulls incrementally while three devices push at once.
      let cursor = '';
      const followed: SyncRecord[] = [];
      const follow = async () => {
        for (let i = 0; i < 6; i++) {
          const page = body(await as('u').pull({ cursor, limit: '3' }));
          followed.push(...(page.records as unknown[]).map(decodeSyncRecord));
          cursor = page.cursor as string;
        }
      };
      const device = async (mine: SyncRecord[][]) => {
        for (const b of mine) expect((await as('u').push(b)).statusCode).toBe(200);
      };
      await Promise.all([
        device(batches.slice(0, 3)),
        device(batches.slice(3, 6)),
        device(batches.slice(6)),
        follow(),
      ]);
      const rest = await as('u').pullAll(cursor);
      followed.push(...rest.records);

      const expected = mergeRecordSets(...batches);
      same((await as('u').pullAll()).records, expected);
      same(followed, expected);

      // Seqs are unique, and none is past the counter.
      const seqs = itemsOf('u').flatMap((i) => (i.seq ? [Number((i.seq as { N: string }).N)] : []));
      expect(new Set(seqs).size).toBe(seqs.length);
      expect(Math.max(...seqs)).toBe(counterOf('u'));
      retries += sleeps.length;
    }
    // The pushes really did race.
    expect(retries).toBeGreaterThan(0);
  });
});
