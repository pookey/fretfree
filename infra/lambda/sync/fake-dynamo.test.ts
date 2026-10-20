import { describe, expect, it } from 'vitest';
import { fakeDynamo } from './fake-dynamo';

const T = 'Sync';
const db = (pageItems?: number) =>
  fakeDynamo({
    tableName: T,
    partitionKey: 'pk',
    sortKey: 'sk',
    indexes: { byN: 'n' },
    ...(pageItems ? { pageItems } : {}),
  });
const key = (sk: string) => ({ pk: { S: 'u' }, sk: { S: sk } });
const errorOf = (p: Promise<unknown>) =>
  p.then(
    () => undefined,
    (e: Error) => e.name,
  );

describe('fakeDynamo', () => {
  it('puts, gets and deletes, honouring conditions', async () => {
    const { call } = db();
    await call('PutItem', { TableName: T, Item: { ...key('a'), n: { N: '1' } } });
    expect(await call('GetItem', { TableName: T, Key: key('a') })).toEqual({
      Item: { ...key('a'), n: { N: '1' } },
    });
    const conditional = {
      TableName: T,
      Item: { ...key('a'), n: { N: '2' } },
      ConditionExpression: 'attribute_not_exists(#sk) OR (n = :one AND NOT n <> :one)',
      ExpressionAttributeNames: { '#sk': 'sk' },
      ExpressionAttributeValues: { ':one': { N: '1' } },
    };
    await call('PutItem', conditional);
    expect(await errorOf(call('PutItem', conditional))).toBe('ConditionalCheckFailedException');
    await call('DeleteItem', { TableName: T, Key: key('a') });
    expect(await call('GetItem', { TableName: T, Key: key('a') })).toEqual({});
    expect(await errorOf(call('GetItem', { TableName: 'Other', Key: key('a') }))).toBe(
      'ResourceNotFoundException',
    );
  });

  it('compares numbers numerically and updates with SET and REMOVE', async () => {
    const { call, items } = db();
    await call('UpdateItem', {
      TableName: T,
      Key: key('a'),
      UpdateExpression: 'SET n = :ten, flag = :yes',
      ExpressionAttributeValues: { ':ten': { N: '10' }, ':yes': { BOOL: true } },
    });
    const bump = {
      TableName: T,
      Key: key('a'),
      UpdateExpression: 'SET n = :eleven REMOVE flag',
      ConditionExpression: 'n > :nine AND n >= :ten AND n < :eleven AND n <= :ten',
      ExpressionAttributeValues: {
        ':nine': { N: '9' },
        ':ten': { N: '10' },
        ':eleven': { N: '11' },
      },
    };
    await call('UpdateItem', bump);
    expect(items.get('u\u0000a')).toEqual({ ...key('a'), n: { N: '11' } });
    expect(await errorOf(call('UpdateItem', bump))).toBe('ConditionalCheckFailedException');
  });

  it('applies a transaction all or nothing', async () => {
    const { call, items } = db();
    await call('PutItem', { TableName: T, Item: { ...key('a'), n: { N: '1' } } });
    const tx = (expected: string) => ({
      TransactItems: [
        { Put: { TableName: T, Item: { ...key('b'), n: { N: '2' } } } },
        {
          ConditionCheck: {
            TableName: T,
            Key: key('a'),
            ConditionExpression: 'n = :v',
            ExpressionAttributeValues: { ':v': { N: expected } },
          },
        },
      ],
    });
    const cancelled = await call('TransactWriteItems', tx('9')).catch((e: unknown) => e);
    expect(cancelled).toMatchObject({
      name: 'TransactionCanceledException',
      CancellationReasons: [{ Code: 'None' }, { Code: 'ConditionalCheckFailed' }],
    });
    expect(items.has('u\u0000b')).toBe(false);
    await call('TransactWriteItems', tx('1'));
    expect(items.has('u\u0000b')).toBe(true);
  });

  it('rejects what DynamoDB rejects', async () => {
    const { call } = db();
    const put = { Put: { TableName: T, Item: key('a') } };
    expect(await errorOf(call('TransactWriteItems', { TransactItems: [put, put] }))).toBe(
      'ValidationException',
    );
    expect(
      await errorOf(
        call('PutItem', { TableName: T, Item: { ...key('a'), big: { S: 'x'.repeat(410_000) } } }),
      ),
    ).toBe('ValidationException');
    const large = (sk: string) => ({
      Put: { TableName: T, Item: { ...key(sk), big: { S: 'x'.repeat(390_000) } } },
    });
    const tooBig = Array.from({ length: 11 }, (_, i) => large(`k${i}`));
    expect(await errorOf(call('TransactWriteItems', { TransactItems: tooBig }))).toBe(
      'ValidationException',
    );
    for (const p of tooBig.slice(0, 10)) await call('PutItem', p.Put);
    await call('PutItem', {
      TableName: T,
      Item: { ...key('k10'), big: { S: 'x'.repeat(390_000) } },
    });
    const gets = Array.from({ length: 11 }, (_, i) => ({
      Get: { TableName: T, Key: key(`k${i}`) },
    }));
    expect(await errorOf(call('TransactGetItems', { TransactItems: gets }))).toBe(
      'ValidationException',
    );
    expect(await errorOf(call('PutItem', { TableName: T, Item: { pk: { S: 'u' } } }))).toBe(
      'ValidationException',
    );
    expect(await errorOf(call('Scan', { TableName: T }))).toBe('Error');
    expect(
      await errorOf(call('PutItem', { TableName: T, Item: key('a'), ConditionExpression: 'n =' })),
    ).toBe('ValidationException');
  });

  it('queries an index in order, in pages, with a projection', async () => {
    const { call } = db(2);
    for (const [sk, n] of [
      ['a', 3],
      ['b', 1],
      ['c', 2],
    ] as const) {
      await call('PutItem', { TableName: T, Item: { ...key(sk), n: { N: String(n) } } });
    }
    await call('PutItem', { TableName: T, Item: key('no-n') });
    const query = (start?: unknown) =>
      call('Query', {
        TableName: T,
        IndexName: 'byN',
        KeyConditionExpression: 'pk = :u AND n BETWEEN :lo AND :hi',
        ProjectionExpression: 'sk',
        ExpressionAttributeValues: { ':u': { S: 'u' }, ':lo': { N: '1' }, ':hi': { N: '3' } },
        ...(start ? { ExclusiveStartKey: start } : {}),
      }) as Promise<{ Items: unknown[]; LastEvaluatedKey?: unknown }>;
    const first = await query();
    expect(first.Items).toEqual([{ sk: { S: 'b' } }, { sk: { S: 'c' } }]);
    const second = await query(first.LastEvaluatedKey);
    expect(second.Items).toEqual([{ sk: { S: 'a' } }]);
    expect(second.LastEvaluatedKey).toBeUndefined();
    const base = (await call('Query', {
      TableName: T,
      KeyConditionExpression: 'pk = :u',
      ExpressionAttributeValues: { ':u': { S: 'u' } },
      ScanIndexForward: false,
      Limit: 1,
    })) as { Items: { sk: { S: string } }[] };
    expect(base.Items.map((i) => i.sk.S)).toEqual(['no-n']);
  });
});
