import { describe, expect, it } from 'vitest';
import type { AwsCall } from '../shared/aws';
import { createDeleteUser } from './users';

const failing =
  (name: string): AwsCall =>
  async () => {
    throw Object.assign(new Error(name), { name });
  };

describe('createDeleteUser', () => {
  it('deletes the user by sub', async () => {
    const calls: unknown[] = [];
    await createDeleteUser(async (op, input) => calls.push([op, input]), 'pool')('sub-1');
    expect(calls).toEqual([['AdminDeleteUser', { UserPoolId: 'pool', Username: 'sub-1' }]]);
  });

  it('counts a user already gone as deleted, and passes on other errors', async () => {
    await expect(
      createDeleteUser(failing('UserNotFoundException'), 'pool')('sub-1'),
    ).resolves.toBeUndefined();
    await expect(
      createDeleteUser(failing('TooManyRequestsException'), 'pool')('sub-1'),
    ).rejects.toThrow('TooManyRequestsException');
  });
});
