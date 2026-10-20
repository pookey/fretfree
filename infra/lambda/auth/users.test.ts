import { describe, expect, it } from 'vitest';
import type { AwsCall } from '../shared/aws';
import { createEnsureUser, randomPassword } from './users';

function fake(fail: Record<string, string> = {}, status = 'CONFIRMED') {
  const calls: [string, Record<string, unknown>][] = [];
  const call: AwsCall = async (op, input) => {
    calls.push([op, input]);
    if (fail[op]) {
      const e = new Error(fail[op]);
      e.name = fail[op];
      throw e;
    }
    return op === 'AdminGetUser' ? { UserStatus: status } : {};
  };
  return { calls, ensure: createEnsureUser(call, 'pool', () => 'pw') };
}

describe('createEnsureUser', () => {
  it('creates a verified user without an invite, then confirms it', async () => {
    const { calls, ensure } = fake();
    await ensure('ada@example.com');
    expect(calls).toEqual([
      [
        'AdminCreateUser',
        {
          UserPoolId: 'pool',
          Username: 'ada@example.com',
          UserAttributes: [
            { Name: 'email', Value: 'ada@example.com' },
            { Name: 'email_verified', Value: 'true' },
          ],
          MessageAction: 'SUPPRESS',
        },
      ],
      [
        'AdminSetUserPassword',
        { UserPoolId: 'pool', Username: 'ada@example.com', Password: 'pw', Permanent: true },
      ],
    ]);
  });

  it('leaves a confirmed user alone, so their other devices stay signed in', async () => {
    const { calls, ensure } = fake({ AdminCreateUser: 'UsernameExistsException' });
    await ensure('ada@example.com');
    expect(calls.map(([op]) => op)).toEqual(['AdminCreateUser', 'AdminGetUser']);
    expect(calls[1]).toEqual(['AdminGetUser', { UserPoolId: 'pool', Username: 'ada@example.com' }]);
  });

  it('confirms an existing user left unconfirmed by an earlier failure', async () => {
    const { calls, ensure } = fake(
      { AdminCreateUser: 'UsernameExistsException' },
      'FORCE_CHANGE_PASSWORD',
    );
    await ensure('ada@example.com');
    expect(calls.map(([op]) => op)).toEqual([
      'AdminCreateUser',
      'AdminGetUser',
      'AdminSetUserPassword',
    ]);
  });

  it('rethrows any other failure', async () => {
    await expect(
      fake({ AdminCreateUser: 'TooManyRequestsException' }).ensure('a@b.co'),
    ).rejects.toThrow('TooManyRequestsException');
    await expect(
      fake({ AdminSetUserPassword: 'TooManyRequestsException' }).ensure('a@b.co'),
    ).rejects.toThrow('TooManyRequestsException');
    await expect(
      fake({
        AdminCreateUser: 'UsernameExistsException',
        AdminGetUser: 'TooManyRequestsException',
      }).ensure('a@b.co'),
    ).rejects.toThrow('TooManyRequestsException');
  });

  it('makes long random passwords that meet the pool policy', () => {
    const pw = randomPassword();
    expect(pw.length).toBeGreaterThanOrEqual(32);
    expect(pw).toMatch(/[a-z]/);
    expect(pw).toMatch(/[A-Z]/);
    expect(pw).toMatch(/\d/);
    expect(pw).toMatch(/[^\w]/);
    expect(randomPassword()).not.toBe(pw);
  });
});
