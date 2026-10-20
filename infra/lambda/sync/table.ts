import { errorName, type AwsCall } from '../shared/aws';
import { ATTR, COUNTER_SK } from './config';

/**
 * The sync table (docs/design/sync.md §5, Server notes). Each user's partition
 * holds one item per record, `table#id` → `{ seq, record }` with the record's
 * canonical wire JSON, plus one counter item holding the last sequence number
 * given out. Records and the counter only ever change together, in one
 * transaction, so commit order equals sequence order.
 */
export interface SyncTable {
  call: AwsCall;
  tableName: string;
  /** The LSI on `seq`. Unlike a GSI it can be read consistently. */
  seqIndex: string;
}

type Attr = { S?: string; N?: string; BOOL?: boolean };
type Item = Record<string, Attr | undefined>;

/** A stored record: its canonical wire JSON and sequence number. */
export interface StoredRecord {
  json: string;
  seq: number;
}

/** The counter and some records, read together. */
export interface Snapshot {
  /** Whether the counter item exists; it doesn't until the first write. */
  counterExists: boolean;
  lastSeq: number;
  closing: boolean;
  /** By sort key; a missing key has no stored record. */
  records: Map<string, StoredRecord>;
}

export interface RecordWrite {
  sk: string;
  json: string;
  /** The stored seq this write replaces, or undefined for a new record. */
  replaces: number | undefined;
}

/** Why DynamoDB cancels a transaction that raced another. Any other reason is a real error. */
const RACE_REASONS = new Set(['None', 'ConditionalCheckFailed', 'TransactionConflict']);

/** Whether a transaction failed only because it raced another write: worth a re-read and retry. */
export function isContention(error: unknown): boolean {
  const name = errorName(error);
  if (name === 'TransactionConflictException') return true;
  if (name !== 'TransactionCanceledException') return false;
  const reasons = (error as { CancellationReasons?: { Code?: string }[] }).CancellationReasons;
  return (reasons ?? []).every((r) => RACE_REASONS.has(r.Code ?? 'None'));
}

const key = (userId: string, sk: string) => ({
  [ATTR.user]: { S: userId },
  [ATTR.sort]: { S: sk },
});

function counterOf(item: Item | undefined): Omit<Snapshot, 'records'> {
  return {
    counterExists: item !== undefined,
    lastSeq: Number(item?.[ATTR.counter]?.N ?? 0),
    closing: item?.[ATTR.closing] !== undefined,
  };
}

/** The counter and the given records in one consistent snapshot (at most 99 records). */
export async function readSnapshot(
  t: SyncTable,
  userId: string,
  sks: readonly string[],
): Promise<Snapshot> {
  const out = (await t.call('TransactGetItems', {
    TransactItems: [COUNTER_SK, ...sks].map((sk) => ({
      Get: { TableName: t.tableName, Key: key(userId, sk) },
    })),
  })) as { Responses?: { Item?: Item }[] };
  const [counter, ...items] = out.Responses ?? [];
  const records = new Map<string, StoredRecord>();
  items.forEach((response, i) => {
    const item = response?.Item;
    const json = item?.[ATTR.record]?.S;
    if (item && json !== undefined) {
      records.set(sks[i]!, { json, seq: Number(item[ATTR.seq]?.N) });
    }
  });
  return { ...counterOf(counter?.Item), records };
}

/** The counter alone, read consistently. */
export async function readCounter(
  t: SyncTable,
  userId: string,
): Promise<Omit<Snapshot, 'records'>> {
  const out = (await t.call('GetItem', {
    TableName: t.tableName,
    Key: key(userId, COUNTER_SK),
    ConsistentRead: true,
  })) as { Item?: Item };
  return counterOf(out.Item);
}

/**
 * Writes the records with the next sequence numbers in one transaction,
 * conditioned on the counter and every record being as `seen` read them, and
 * on the account not closing. Throws a contention error (`isContention`) if
 * anything changed in between.
 */
export async function writeRecords(
  t: SyncTable,
  userId: string,
  seen: Omit<Snapshot, 'records'>,
  writes: readonly RecordWrite[],
): Promise<void> {
  const next = seen.lastSeq + writes.length;
  const counter = {
    Update: {
      TableName: t.tableName,
      Key: key(userId, COUNTER_SK),
      UpdateExpression: 'SET #last = :next',
      ConditionExpression: seen.counterExists
        ? '#last = :seen AND attribute_not_exists(#closing)'
        : 'attribute_not_exists(#sk)',
      ExpressionAttributeNames: seen.counterExists
        ? { '#last': ATTR.counter, '#closing': ATTR.closing }
        : { '#last': ATTR.counter, '#sk': ATTR.sort },
      ExpressionAttributeValues: {
        ':next': { N: String(next) },
        ...(seen.counterExists ? { ':seen': { N: String(seen.lastSeq) } } : {}),
      },
    },
  };
  const puts = writes.map((w, i) => ({
    Put: {
      TableName: t.tableName,
      Item: {
        ...key(userId, w.sk),
        [ATTR.seq]: { N: String(seen.lastSeq + 1 + i) },
        [ATTR.record]: { S: w.json },
      },
      ...(w.replaces === undefined
        ? {
            ConditionExpression: 'attribute_not_exists(#sk)',
            ExpressionAttributeNames: { '#sk': ATTR.sort },
          }
        : {
            ConditionExpression: '#seq = :seq',
            ExpressionAttributeNames: { '#seq': ATTR.seq },
            ExpressionAttributeValues: { ':seq': { N: String(w.replaces) } },
          }),
    },
  }));
  await t.call('TransactWriteItems', { TransactItems: [counter, ...puts] });
}

/** One page of a pull: records with `after < seq ≤ upTo`, oldest first. */
export async function queryBySeq(
  t: SyncTable,
  userId: string,
  after: number,
  upTo: number,
  limit: number,
  startKey?: Item,
): Promise<{ records: StoredRecord[]; next?: Item }> {
  const out = (await t.call('Query', {
    TableName: t.tableName,
    IndexName: t.seqIndex,
    ConsistentRead: true,
    KeyConditionExpression: '#u = :u AND #seq BETWEEN :lo AND :hi',
    ProjectionExpression: '#seq, #rec',
    ExpressionAttributeNames: { '#u': ATTR.user, '#seq': ATTR.seq, '#rec': ATTR.record },
    ExpressionAttributeValues: {
      ':u': { S: userId },
      ':lo': { N: String(after + 1) },
      ':hi': { N: String(upTo) },
    },
    Limit: limit,
    ...(startKey ? { ExclusiveStartKey: startKey } : {}),
  })) as { Items?: Item[]; LastEvaluatedKey?: Item };
  return {
    records: (out.Items ?? []).map((item) => ({
      json: item[ATTR.record]?.S ?? 'null',
      seq: Number(item[ATTR.seq]?.N),
    })),
    ...(out.LastEvaluatedKey ? { next: out.LastEvaluatedKey } : {}),
  };
}

/** Marks the account as closing, creating the counter if there isn't one. */
export async function markClosing(t: SyncTable, userId: string): Promise<void> {
  await t.call('UpdateItem', {
    TableName: t.tableName,
    Key: key(userId, COUNTER_SK),
    UpdateExpression: 'SET #closing = :yes',
    ExpressionAttributeNames: { '#closing': ATTR.closing },
    ExpressionAttributeValues: { ':yes': { BOOL: true } },
  });
}

/** One page of the sort keys in a user's partition, counter included. */
export async function querySortKeys(
  t: SyncTable,
  userId: string,
  startKey?: Item,
): Promise<{ sks: string[]; next?: Item }> {
  const out = (await t.call('Query', {
    TableName: t.tableName,
    ConsistentRead: true,
    KeyConditionExpression: '#u = :u',
    ProjectionExpression: '#sk',
    ExpressionAttributeNames: { '#u': ATTR.user, '#sk': ATTR.sort },
    ExpressionAttributeValues: { ':u': { S: userId } },
    ...(startKey ? { ExclusiveStartKey: startKey } : {}),
  })) as { Items?: Item[]; LastEvaluatedKey?: Item };
  return {
    sks: (out.Items ?? []).flatMap((item) => item[ATTR.sort]?.S ?? []),
    ...(out.LastEvaluatedKey ? { next: out.LastEvaluatedKey } : {}),
  };
}

/**
 * Deletes up to 25 items. Returns the sort keys DynamoDB left unprocessed
 * (throttling), for the caller to retry.
 */
export async function deleteBatch(
  t: SyncTable,
  userId: string,
  sks: readonly string[],
): Promise<string[]> {
  const out = (await t.call('BatchWriteItem', {
    RequestItems: {
      [t.tableName]: sks.map((sk) => ({ DeleteRequest: { Key: key(userId, sk) } })),
    },
  })) as { UnprocessedItems?: Record<string, { DeleteRequest?: { Key?: Item } }[]> };
  return (out.UnprocessedItems?.[t.tableName] ?? []).flatMap(
    (r) => r.DeleteRequest?.Key?.[ATTR.sort]?.S ?? [],
  );
}

/** Deletes one item. */
export async function deleteItem(t: SyncTable, userId: string, sk: string): Promise<void> {
  await t.call('DeleteItem', { TableName: t.tableName, Key: key(userId, sk) });
}
