import { errorName, type AwsCall } from '../shared/aws';
import type { PendingSignIn } from './secrets';

/** Pending sign-ins and rate-limit counters. Times are epoch seconds. */
export interface SignInStore {
  get(key: string): Promise<PendingSignIn | undefined>;
  /**
   * Replaces any earlier issue for the key, so only the newest email works, unless
   * that issue was sent after `sentBefore`. False then: the resend cooldown holds,
   * even for two requests racing each other.
   */
  putUnlessRecent(key: string, record: PendingSignIn, sentBefore: number): Promise<boolean>;
  /**
   * Counts one answer against the pending sign-in and returns it, or undefined
   * when there is none, it has expired, or it has no attempts left.
   */
  useAttempt(key: string, now: number, maxAttempts: number): Promise<PendingSignIn | undefined>;
  /** Deletes the issue made with `salt`. False if it's already gone or replaced. */
  consume(key: string, salt: string): Promise<boolean>;
  /** Adds one to a counter that expires at `expiresAt`, and returns the new count. */
  increment(key: string, expiresAt: number): Promise<number>;
}

type Item = Record<string, { S?: string; N?: string } | undefined>;

const toItem = (key: string, r: PendingSignIn): Item => ({
  pk: { S: key },
  codeHash: { S: r.codeHash },
  linkHash: { S: r.linkHash },
  salt: { S: r.salt },
  expiresAt: { N: String(r.expiresAt) },
  sentAt: { N: String(r.sentAt) },
  attempts: { N: String(r.attempts) },
});

const fromItem = (item: Item): PendingSignIn => ({
  codeHash: item.codeHash?.S ?? '',
  linkHash: item.linkHash?.S ?? '',
  salt: item.salt?.S ?? '',
  expiresAt: Number(item.expiresAt?.N ?? 0),
  sentAt: Number(item.sentAt?.N ?? 0),
  attempts: Number(item.attempts?.N ?? 0),
});

const conditionFailed = (error: unknown): boolean =>
  errorName(error) === 'ConditionalCheckFailedException';

/**
 * The store on one DynamoDB table with a string partition key `pk` and TTL on
 * `expiresAt`. TTL deletion is lazy, so every read also checks the expiry.
 */
export function dynamoStore(call: AwsCall, tableName: string): SignInStore {
  const Key = (key: string) => ({ pk: { S: key } });
  return {
    async get(key) {
      const out = (await call('GetItem', {
        TableName: tableName,
        Key: Key(key),
        ConsistentRead: true,
      })) as {
        Item?: Item;
      };
      return out.Item ? fromItem(out.Item) : undefined;
    },
    async putUnlessRecent(key, record, sentBefore) {
      try {
        await call('PutItem', {
          TableName: tableName,
          Item: toItem(key, record),
          ConditionExpression: 'attribute_not_exists(pk) OR sentAt <= :before',
          ExpressionAttributeValues: { ':before': { N: String(sentBefore) } },
        });
        return true;
      } catch (error) {
        if (conditionFailed(error)) return false;
        throw error;
      }
    },
    async useAttempt(key, now, maxAttempts) {
      try {
        const out = (await call('UpdateItem', {
          TableName: tableName,
          Key: Key(key),
          UpdateExpression: 'ADD attempts :one',
          ConditionExpression: 'attribute_exists(pk) AND expiresAt > :now AND attempts < :max',
          ExpressionAttributeValues: {
            ':one': { N: '1' },
            ':now': { N: String(now) },
            ':max': { N: String(maxAttempts) },
          },
          ReturnValues: 'ALL_NEW',
        })) as { Attributes?: Item };
        return out.Attributes ? fromItem(out.Attributes) : undefined;
      } catch (error) {
        if (conditionFailed(error)) return undefined;
        throw error;
      }
    },
    async consume(key, salt) {
      try {
        await call('DeleteItem', {
          TableName: tableName,
          Key: Key(key),
          ConditionExpression: 'salt = :salt',
          ExpressionAttributeValues: { ':salt': { S: salt } },
        });
        return true;
      } catch (error) {
        if (conditionFailed(error)) return false;
        throw error;
      }
    },
    async increment(key, expiresAt) {
      const out = (await call('UpdateItem', {
        TableName: tableName,
        Key: Key(key),
        UpdateExpression: 'ADD hits :one SET expiresAt = if_not_exists(expiresAt, :exp)',
        ExpressionAttributeValues: { ':one': { N: '1' }, ':exp': { N: String(expiresAt) } },
        ReturnValues: 'UPDATED_NEW',
      })) as { Attributes?: { hits?: { N?: string } } };
      return Number(out.Attributes?.hits?.N ?? 0);
    },
  };
}

/** The same contract in memory, for tests. */
export function memoryStore(): SignInStore & { records: Map<string, PendingSignIn> } {
  const records = new Map<string, PendingSignIn>();
  const counters = new Map<string, number>();
  return {
    records,
    async get(key) {
      const r = records.get(key);
      return r && { ...r };
    },
    async putUnlessRecent(key, record, sentBefore) {
      const current = records.get(key);
      if (current && current.sentAt > sentBefore) return false;
      records.set(key, { ...record });
      return true;
    },
    async useAttempt(key, now, maxAttempts) {
      const r = records.get(key);
      if (!r || r.expiresAt <= now || r.attempts >= maxAttempts) return undefined;
      r.attempts += 1;
      return { ...r };
    },
    async consume(key, salt) {
      if (records.get(key)?.salt !== salt) return false;
      records.delete(key);
      return true;
    },
    async increment(key) {
      const n = (counters.get(key) ?? 0) + 1;
      counters.set(key, n);
      return n;
    },
  };
}
