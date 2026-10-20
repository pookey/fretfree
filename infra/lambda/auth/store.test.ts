import { describe, expect, it } from 'vitest';
import type { AwsCall } from '../shared/aws';
import { dynamoStore } from './store';

const record = {
  codeHash: 'c',
  linkHash: 'l',
  salt: 's',
  expiresAt: 2000,
  sentAt: 1100,
  attempts: 1,
};
const item = {
  pk: { S: 'k' },
  codeHash: { S: 'c' },
  linkHash: { S: 'l' },
  salt: { S: 's' },
  expiresAt: { N: '2000' },
  sentAt: { N: '1100' },
  attempts: { N: '1' },
};

function fake(reply: (op: string, input: Record<string, unknown>) => unknown) {
  const calls: [string, Record<string, unknown>][] = [];
  const call: AwsCall = async (op, input) => {
    calls.push([op, input]);
    return reply(op, input);
  };
  return { calls, store: dynamoStore(call, 'SignIn') };
}

const conditionFailed = () => {
  const e = new Error('nope');
  e.name = 'ConditionalCheckFailedException';
  throw e;
};

describe('dynamoStore', () => {
  it('reads consistently and round-trips a record', async () => {
    const { calls, store } = fake((op) => (op === 'GetItem' ? { Item: item } : {}));
    expect(await store.get('k')).toEqual(record);
    expect(calls[0]).toEqual([
      'GetItem',
      { TableName: 'SignIn', Key: { pk: { S: 'k' } }, ConsistentRead: true },
    ]);
  });

  it('writes a new issue only when the last one is older than the cooldown', async () => {
    const { calls, store } = fake(() => ({}));
    expect(await store.putUnlessRecent('k', record, 1050)).toBe(true);
    expect(calls[0]).toEqual([
      'PutItem',
      {
        TableName: 'SignIn',
        Item: item,
        ConditionExpression: 'attribute_not_exists(pk) OR sentAt <= :before',
        ExpressionAttributeValues: { ':before': { N: '1050' } },
      },
    ]);
    expect(await fake(conditionFailed).store.putUnlessRecent('k', record, 1050)).toBe(false);
  });

  it('returns undefined for a missing record', async () => {
    const { store } = fake(() => ({}));
    expect(await store.get('k')).toBeUndefined();
  });

  it('counts an attempt only on a live record with attempts left', async () => {
    const { calls, store } = fake(() => ({ Attributes: { ...item, attempts: { N: '2' } } }));
    expect(await store.useAttempt('k', 1500, 5)).toEqual({ ...record, attempts: 2 });
    expect(calls[0]![1]).toMatchObject({
      UpdateExpression: 'ADD attempts :one',
      ConditionExpression: 'attribute_exists(pk) AND expiresAt > :now AND attempts < :max',
      ExpressionAttributeValues: { ':one': { N: '1' }, ':now': { N: '1500' }, ':max': { N: '5' } },
    });
    expect(await fake(conditionFailed).store.useAttempt('k', 1500, 5)).toBeUndefined();
  });

  it('consumes only the issue with the given salt', async () => {
    const { calls, store } = fake(() => ({}));
    expect(await store.consume('k', 's')).toBe(true);
    expect(calls[0]![1]).toMatchObject({
      ConditionExpression: 'salt = :salt',
      ExpressionAttributeValues: { ':salt': { S: 's' } },
    });
    expect(await fake(conditionFailed).store.consume('k', 's')).toBe(false);
  });

  it('rethrows anything but a failed condition', async () => {
    const { store } = fake(() => {
      throw new Error('throttled');
    });
    await expect(store.useAttempt('k', 1, 1)).rejects.toThrow('throttled');
    await expect(store.consume('k', 's')).rejects.toThrow('throttled');
    await expect(store.putUnlessRecent('k', record, 1)).rejects.toThrow('throttled');
  });

  it('increments a counter that keeps its first expiry', async () => {
    const { calls, store } = fake(() => ({ Attributes: { hits: { N: '3' } } }));
    expect(await store.increment('rate', 3600)).toBe(3);
    expect(calls[0]![1]).toMatchObject({
      UpdateExpression: 'ADD hits :one SET expiresAt = if_not_exists(expiresAt, :exp)',
      ExpressionAttributeValues: { ':one': { N: '1' }, ':exp': { N: '3600' } },
    });
  });
});
