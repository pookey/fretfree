// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccountApiError } from './api';
import { cooldownLeft, createSignIn, normaliseCode, normaliseEmail } from './flow';
import { loadAccount, loadPending, savePending } from './store';
import { fakeServer, fakeSignIn, TOKENS } from './test-fakes';

const T0 = 1_800_000_000_000;

afterEach(() => {
  localStorage.clear();
  savePending(null);
});

describe('normalising input', () => {
  it('trims and lower-cases an email, and rejects what the server would', () => {
    expect(normaliseEmail('  Me@Example.COM ')).toBe('me@example.com');
    expect(normaliseEmail('me@example')).toBeNull();
    expect(normaliseEmail('me @example.com')).toBeNull();
    expect(normaliseEmail(`${'a'.repeat(250)}@b.co`)).toBeNull();
  });

  it('accepts a 6-digit code typed with spaces or a dash', () => {
    expect(normaliseCode('123 456')).toBe('123456');
    expect(normaliseCode('123-456')).toBe('123456');
    expect(normaliseCode('12345')).toBeNull();
    expect(normaliseCode('12345a')).toBeNull();
  });

  it('counts the resend cooldown down from the last send', () => {
    const pending = { email: 'a@b.co', sentAt: T0, expiresAt: T0 + 900_000, codeAnswers: 0 };
    expect(cooldownLeft(null, T0)).toBe(0);
    expect(cooldownLeft(pending, T0)).toBe(60);
    expect(cooldownLeft(pending, T0 + 59_500)).toBe(1);
    expect(cooldownLeft(pending, T0 + 60_000)).toBe(0);
  });
});

describe('starting a sign-in', () => {
  it('sends the normalised email and keeps the pending sign-in', async () => {
    const server = fakeServer();
    const signIn = fakeSignIn(server, { now: T0 });
    const outcome = await signIn.start(' Me@Example.com ');
    const pending = {
      email: 'me@example.com',
      sentAt: T0,
      expiresAt: T0 + 900_000,
      codeAnswers: 0,
    };
    expect(outcome).toEqual({ kind: 'sent', pending });
    expect(server.api.start).toHaveBeenCalledWith('me@example.com');
    expect(loadPending()).toEqual(pending);
  });

  it('assumes 15 minutes when the server gives no expiry', async () => {
    const signIn = fakeSignIn(fakeServer({ start: { kind: 'sent', expiresIn: 0 } }), { now: T0 });
    await signIn.start('a@b.co');
    expect(loadPending()?.expiresAt).toBe(T0 + 15 * 60_000);
  });

  it('checks the address before asking the server', async () => {
    const server = fakeServer();
    expect(await fakeSignIn(server).start('nope')).toEqual({ kind: 'invalid-email' });
    expect(server.api.start).not.toHaveBeenCalled();
  });

  it('passes on rate limits and network trouble without a pending sign-in', async () => {
    const limited = fakeSignIn(fakeServer({ start: { kind: 'rate-limited', retryAfter: 30 } }));
    expect(await limited.start('a@b.co')).toEqual({ kind: 'rate-limited', retryAfter: 30 });
    const server = fakeServer();
    vi.mocked(server.api.start)
      .mockRejectedValueOnce(new AccountApiError('network'))
      .mockRejectedValueOnce(new AccountApiError('start', 500));
    const signIn = fakeSignIn(server);
    expect(await signIn.start('a@b.co')).toEqual({ kind: 'error', trouble: 'offline' });
    expect(await signIn.start('a@b.co')).toEqual({ kind: 'error', trouble: 'server' });
    expect(loadPending()).toBeNull();
  });
});

describe('answering with the code', () => {
  async function started(server = fakeServer(), clock = { now: T0 }) {
    const signIn = fakeSignIn(server, clock);
    await signIn.start('a@b.co');
    return { signIn, server, clock };
  }

  it('signs in with the right code and clears the pending sign-in', async () => {
    const { signIn } = await started();
    const outcome = await signIn.submitCode('123 456');
    const account = { email: 'a@b.co', tokens: TOKENS, signedInAt: T0 };
    expect(outcome).toEqual({ kind: 'signed-in', account });
    expect(loadAccount()).toEqual(account);
    expect(loadPending()).toBeNull();
  });

  it('needs an email first', async () => {
    expect(await fakeSignIn().submitCode('123456')).toEqual({ kind: 'no-pending' });
  });

  it('spends no attempt on something that isn’t a code', async () => {
    const { signIn, server } = await started();
    expect(await signIn.submitCode('12345')).toEqual({ kind: 'invalid-code' });
    expect(server.cognito.begin).not.toHaveBeenCalled();
    expect(loadPending()?.codeAnswers).toBe(0);
  });

  it('counts wrong codes, opening a new session after every 3, and stops at 5', async () => {
    const { signIn, server } = await started();
    const left = [];
    for (let i = 0; i < 5; i++) left.push(await signIn.submitCode('000000'));
    expect(left).toEqual([
      { kind: 'wrong', attemptsLeft: 4 },
      { kind: 'wrong', attemptsLeft: 3 },
      { kind: 'wrong', attemptsLeft: 2 },
      { kind: 'wrong', attemptsLeft: 1 },
      { kind: 'too-many' },
    ]);
    expect(server.cognito.begin).toHaveBeenCalledTimes(2);
    expect(await signIn.submitCode('123456')).toEqual({ kind: 'too-many' });
    expect(server.cognito.answer).toHaveBeenCalledTimes(5);
  });

  it('keeps the count across reloads', async () => {
    const { signIn } = await started();
    await signIn.submitCode('000000');
    const reloaded = fakeSignIn(fakeServer(), { now: T0 });
    expect(await reloaded.submitCode('000000')).toEqual({ kind: 'wrong', attemptsLeft: 3 });
  });

  it('says a code has expired once its 15 minutes are up', async () => {
    const { signIn, server, clock } = await started();
    clock.now = T0 + 900_000;
    expect(await signIn.submitCode('123456')).toEqual({ kind: 'expired' });
    expect(server.cognito.answer).not.toHaveBeenCalled();
  });

  it('opens a new session when the old one is too old', async () => {
    const server = fakeServer({ start: { kind: 'sent', expiresIn: 3600 } });
    const { signIn, clock } = await started(server);
    await signIn.submitCode('000000');
    clock.now = T0 + 14 * 60_000;
    await signIn.submitCode('000000');
    expect(server.cognito.begin).toHaveBeenCalledTimes(1);
    clock.now = T0 + 15 * 60_000;
    await signIn.submitCode('000000');
    expect(server.cognito.begin).toHaveBeenCalledTimes(2);
  });

  it('asks once more when Cognito says the session expired before checking', async () => {
    const { signIn, server } = await started();
    vi.mocked(server.cognito.answer).mockResolvedValueOnce({ kind: 'session-expired' });
    expect((await signIn.submitCode('123456')).kind).toBe('signed-in');
    expect(server.cognito.begin).toHaveBeenCalledTimes(2);
  });

  it('starts over after a new email', async () => {
    const { signIn, clock } = await started();
    await signIn.submitCode('000000');
    clock.now = T0 + 61_000;
    await signIn.start('a@b.co');
    expect(loadPending()).toMatchObject({ codeAnswers: 0, sentAt: T0 + 61_000 });
  });

  it('reports network trouble', async () => {
    const { signIn, server } = await started();
    vi.mocked(server.cognito.answer).mockRejectedValueOnce(new AccountApiError('network'));
    expect(await signIn.submitCode('123456')).toEqual({ kind: 'error', trouble: 'offline' });
  });

  it('forgets the pending sign-in on cancel', async () => {
    const { signIn } = await started();
    signIn.cancel();
    expect(loadPending()).toBeNull();
  });
});

describe('answering with the link', () => {
  it('signs in with the token, spending no code attempt', async () => {
    const server = fakeServer();
    const signIn = fakeSignIn(server, { now: T0 });
    expect(await signIn.verifyLink('A@B.co', 'link-token')).toEqual({
      kind: 'signed-in',
      account: { email: 'a@b.co', tokens: TOKENS, signedInAt: T0 },
    });
    expect(server.cognito.answer).toHaveBeenCalledWith(
      { session: 's1', username: 'a@b.co' },
      'link-token',
    );
  });

  it('fails a used, expired or mangled link', async () => {
    const signIn = fakeSignIn();
    expect(await signIn.verifyLink('a@b.co', 'old')).toEqual({ kind: 'link-failed' });
    expect(await signIn.verifyLink('a@b', 'link-token')).toEqual({ kind: 'link-failed' });
    expect(await signIn.verifyLink('a@b.co', '')).toEqual({ kind: 'link-failed' });
    expect(loadAccount()).toBeNull();
  });

  it('reports network trouble', async () => {
    const server = fakeServer();
    vi.mocked(server.cognito.begin).mockRejectedValueOnce(new AccountApiError('network'));
    expect(await fakeSignIn(server).verifyLink('a@b.co', 'link-token')).toEqual({
      kind: 'error',
      trouble: 'offline',
    });
  });
});

describe('a signed-in account', () => {
  async function signedIn(clock = { now: T0 }) {
    const server = fakeServer();
    const signIn = fakeSignIn(server, clock);
    await signIn.verifyLink('a@b.co', 'link-token');
    return { signIn, server, clock };
  }

  it('signs out on this device and revokes the refresh token', async () => {
    const { signIn, server } = await signedIn();
    await signIn.signOut();
    expect(loadAccount()).toBeNull();
    expect(server.cognito.revoke).toHaveBeenCalledWith('refresh');
  });

  it('signs out even when revoking fails', async () => {
    const { signIn, server } = await signedIn();
    vi.mocked(server.cognito.revoke).mockRejectedValueOnce(new AccountApiError('network'));
    await signIn.signOut();
    expect(loadAccount()).toBeNull();
  });

  it('hands out the access token, refreshing it near expiry', async () => {
    const server = fakeServer();
    const clock = { now: T0 };
    const signIn = createSignIn({
      api: server.api,
      cognito: async () => server.cognito,
      now: () => clock.now,
    });
    expect(await signIn.accessToken()).toBeNull();
    vi.mocked(server.cognito.answer).mockResolvedValueOnce({
      kind: 'signed-in',
      tokens: { ...TOKENS, expiresAt: T0 + 3600_000 },
    });
    await signIn.verifyLink('a@b.co', 'link-token');
    expect(await signIn.accessToken()).toBe('access');
    expect(server.cognito.refresh).not.toHaveBeenCalled();
    clock.now = T0 + 3600_000 - 30_000;
    expect(await signIn.accessToken()).toBe('access2');
    expect(server.cognito.refresh).toHaveBeenCalledWith('refresh');
    expect(loadAccount()?.tokens).toMatchObject({
      accessToken: 'access2',
      refreshToken: 'refresh',
    });
  });

  it('signs out locally when Cognito refuses the refresh', async () => {
    const { signIn, server } = await signedIn();
    vi.mocked(server.cognito.refresh).mockRejectedValueOnce(
      new AccountApiError('NotAuthorizedException'),
    );
    expect(await signIn.accessToken()).toBeNull();
    expect(loadAccount()).toBeNull();
  });

  it('stays signed in through network trouble on a refresh', async () => {
    const { signIn, server } = await signedIn();
    vi.mocked(server.cognito.refresh).mockRejectedValueOnce(new AccountApiError('network'));
    await expect(signIn.accessToken()).rejects.toThrow('network');
    expect(loadAccount()?.email).toBe('a@b.co');
  });

  it('shares one refresh between callers that arrive together', async () => {
    const { signIn, server } = await signedIn();
    const tokens = await Promise.all([signIn.accessToken(), signIn.accessToken()]);
    expect(tokens).toEqual(['access2', 'access2']);
    expect(server.cognito.refresh).toHaveBeenCalledTimes(1);
  });

  it('drops a refresh that finishes after signing out', async () => {
    const { signIn, server } = await signedIn();
    vi.mocked(server.cognito.refresh).mockImplementationOnce(async () => {
      await signIn.signOut();
      return { idToken: 'id2', accessToken: 'access2', expiresAt: 0 };
    });
    expect(await signIn.accessToken()).toBeNull();
    expect(loadAccount()).toBeNull();
  });
});
