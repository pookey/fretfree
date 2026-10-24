// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccountApiError } from './api';
import type { Cognito } from './cognito';
import {
  createAccountDeletion,
  createDeleteAccount,
  DELETE_TIMING,
  waitOrOnline,
  type DeletionDeps,
} from './delete';
import {
  DELETION_KEY,
  loadAccount,
  loadDeletion,
  loadPending,
  saveAccount,
  saveDeletion,
  savePending,
} from './store';
import { TOKENS } from './test-fakes';

const NOW = 1_800_000_000_000;
const EMAIL = 'me@example.com';
const LIVE = { ...TOKENS, expiresAt: NOW + 3_600_000 };

afterEach(() => {
  saveAccount(null);
  savePending(null);
  saveDeletion(null);
  localStorage.clear();
  vi.useRealTimers();
});

/** Each call takes the next answer: 'ok', or an error to throw. */
function fakeDeps(answers: (Error | 'ok')[] = ['ok'], over: Partial<DeletionDeps> = {}) {
  const sent: string[] = [];
  const waits: number[] = [];
  const cognito: Cognito = {
    begin: vi.fn(),
    answer: vi.fn(),
    refresh: vi.fn(async () => ({
      idToken: 'id2',
      accessToken: 'access2',
      expiresAt: NOW + 3_600_000,
    })),
    revoke: vi.fn(async () => undefined),
  };
  const deps: DeletionDeps = {
    deleteAccount: vi.fn(async (token: string) => {
      sent.push(token);
      const next = answers.shift() ?? 'ok';
      if (next !== 'ok') throw next;
    }),
    cognito: async () => cognito,
    now: () => NOW,
    stopSync: vi.fn(),
    restartSync: vi.fn(),
    clearLocal: vi.fn(async () => undefined),
    wait: vi.fn(async (ms: number) => {
      waits.push(ms);
    }),
    ...over,
  };
  return { deps, sent, waits, cognito };
}

const signIn = (tokens = LIVE) => saveAccount({ email: EMAIL, tokens, signedInAt: NOW - 1000 });

describe('createAccountDeletion', () => {
  it('stops syncing and signs out at once, then deletes the account', async () => {
    signIn();
    savePending({ email: EMAIL, sentAt: NOW, expiresAt: NOW + 1000, codeAnswers: 0 });
    const { deps, sent } = fakeDeps();
    const flow = createAccountDeletion(deps);
    const done = flow.request(true);
    expect(deps.stopSync).toHaveBeenCalledOnce();
    expect(loadAccount()).toBeNull();
    expect(loadPending()).toBeNull();
    expect(loadDeletion()).toMatchObject({ email: EMAIL, keepLocal: true, requestedAt: NOW });
    expect(flow.status()).toEqual({
      phase: 'deleting',
      email: EMAIL,
      keepLocal: true,
      trouble: null,
    });
    await done;
    expect(sent).toEqual(['access']);
    expect(flow.status()).toEqual({
      phase: 'deleted',
      email: EMAIL,
      keepLocal: true,
      confirmed: true,
    });
    expect(loadDeletion()).toBeNull();
    expect(deps.clearLocal).not.toHaveBeenCalled();
    // Signing in again without a reload syncs the new account.
    expect(deps.restartSync).toHaveBeenCalledOnce();
  });

  it('never revokes the tokens the delete still needs', async () => {
    signIn();
    const { deps, cognito } = fakeDeps();
    await createAccountDeletion(deps).request(true);
    expect(cognito.revoke).not.toHaveBeenCalled();
  });

  it('clears this device only once the server has said the account is gone', async () => {
    signIn();
    const order: string[] = [];
    const { deps } = fakeDeps(['ok'], {
      deleteAccount: async () => void order.push('delete'),
      clearLocal: async () => void order.push('clear'),
    });
    const flow = createAccountDeletion(deps);
    await flow.request(false);
    expect(order).toEqual(['delete', 'clear']);
    // The database is gone: nothing restarts sync on it before the reload.
    expect(deps.restartSync).not.toHaveBeenCalled();
    expect(flow.status()).toEqual({
      phase: 'deleted',
      email: EMAIL,
      keepLocal: false,
      confirmed: true,
    });
  });

  it('sends the delete again after each failure, backing off, until it gets a 200', async () => {
    signIn();
    const offline = new AccountApiError('network');
    const busy = new AccountApiError('delete', 503);
    const { deps, sent, waits } = fakeDeps([offline, busy, busy, busy, busy, busy, busy, 'ok']);
    const seen: (string | null)[] = [];
    const flow = createAccountDeletion(deps);
    flow.subscribe(() => {
      const s = flow.status();
      if (s.phase === 'deleting') seen.push(s.trouble);
    });
    await flow.request(true);
    expect(sent).toHaveLength(8);
    expect(waits).toEqual([2000, 4000, 8000, 16_000, 32_000, 60_000, DELETE_TIMING.maxRetryMs]);
    expect(seen).toContain('offline');
    expect(seen).toContain('server');
    expect(flow.status().phase).toBe('deleted');
  });

  it('keeps its place across a reload, and carries on from the stored tokens', async () => {
    saveDeletion({ email: EMAIL, tokens: LIVE, keepLocal: false, requestedAt: NOW });
    const { deps, sent } = fakeDeps();
    const flow = createAccountDeletion(deps);
    expect(flow.status()).toEqual({ phase: 'idle' });
    await flow.resume();
    expect(sent).toEqual(['access']);
    expect(deps.clearLocal).toHaveBeenCalledOnce();
    expect(flow.status()).toEqual({
      phase: 'deleted',
      email: EMAIL,
      keepLocal: false,
      confirmed: true,
    });
  });

  it('runs one loop however often it is resumed', async () => {
    saveDeletion({ email: EMAIL, tokens: LIVE, keepLocal: true, requestedAt: NOW });
    const { deps, sent } = fakeDeps();
    const flow = createAccountDeletion(deps);
    await Promise.all([flow.resume(), flow.resume()]);
    expect(sent).toHaveLength(1);
  });

  it('does nothing to resume when no delete is waiting', async () => {
    const { deps, sent } = fakeDeps();
    const flow = createAccountDeletion(deps);
    await flow.resume();
    await flow.request(true);
    expect(sent).toEqual([]);
    expect(deps.stopSync).not.toHaveBeenCalled();
    expect(flow.status()).toEqual({ phase: 'idle' });
  });

  it('refreshes an expiring token and keeps the fresh one for the next try', async () => {
    signIn({ ...TOKENS, expiresAt: NOW + 30_000 });
    const { deps, sent } = fakeDeps([new AccountApiError('network'), 'ok']);
    let stored: string | undefined;
    deps.wait = async () => void (stored = loadDeletion()?.tokens.accessToken);
    await createAccountDeletion(deps).request(true);
    expect(stored).toBe('access2');
    expect(sent).toEqual(['access2', 'access2']);
  });

  it('refreshes after a refused token', async () => {
    signIn();
    const { deps, sent } = fakeDeps([new AccountApiError('delete', 401), 'ok']);
    await createAccountDeletion(deps).request(true);
    expect(sent).toEqual(['access', 'access2']);
  });

  it('counts a refused refresh as done: the server deletes the user only after every record', async () => {
    // A delete that finished on the server while its reply was lost, resumed
    // after the hour-long access token ran out.
    saveDeletion({
      email: EMAIL,
      tokens: { ...TOKENS, expiresAt: 0 },
      keepLocal: true,
      requestedAt: NOW,
    });
    const { deps, sent, cognito } = fakeDeps();
    vi.mocked(cognito.refresh).mockRejectedValue(new AccountApiError('NotAuthorizedException'));
    const flow = createAccountDeletion(deps);
    await flow.resume();
    expect(sent).toEqual([]);
    expect(flow.status()).toEqual({
      phase: 'deleted',
      email: EMAIL,
      keepLocal: true,
      confirmed: false,
    });
    expect(loadDeletion()).toBeNull();
    expect(deps.clearLocal).not.toHaveBeenCalled();
    expect(deps.restartSync).toHaveBeenCalledOnce();
    flow.dismiss();
    expect(flow.status()).toEqual({ phase: 'idle' });
  });

  it('still clears this device after a refused refresh when the learner asked', async () => {
    saveDeletion({
      email: EMAIL,
      tokens: { ...TOKENS, expiresAt: 0 },
      keepLocal: false,
      requestedAt: NOW,
    });
    const { deps, cognito } = fakeDeps();
    vi.mocked(cognito.refresh).mockRejectedValue(new AccountApiError('NotAuthorizedException'));
    const flow = createAccountDeletion(deps);
    await flow.resume();
    expect(deps.clearLocal).toHaveBeenCalledOnce();
    expect(deps.restartSync).not.toHaveBeenCalled();
    expect(flow.status()).toMatchObject({ phase: 'deleted', keepLocal: false, confirmed: false });
  });

  it('treats any other refresh failure as trouble to retry', async () => {
    signIn({ ...TOKENS, expiresAt: 0 });
    const { deps, sent, cognito } = fakeDeps();
    vi.mocked(cognito.refresh)
      .mockRejectedValueOnce(new AccountApiError('network'))
      .mockResolvedValue({ idToken: 'id2', accessToken: 'access2', expiresAt: NOW + 3_600_000 });
    await createAccountDeletion(deps).request(true);
    expect(sent).toEqual(['access2']);
  });

  it('reports done when another tab finished the delete', async () => {
    signIn();
    const { deps } = fakeDeps([new AccountApiError('network')], {
      wait: async () => saveDeletion(null),
    });
    const flow = createAccountDeletion(deps);
    await flow.request(false);
    expect(flow.status()).toEqual({
      phase: 'deleted',
      email: EMAIL,
      keepLocal: false,
      confirmed: true,
    });
    expect(deps.clearLocal).not.toHaveBeenCalled();
  });

  it('keeps a delete stored by another version of the page only when it is well formed', () => {
    localStorage.setItem(DELETION_KEY, JSON.stringify({ email: EMAIL, tokens: LIVE }));
    expect(loadDeletion()).toBeNull();
  });

  it('dismiss leaves a delete in flight alone', async () => {
    signIn();
    let release!: () => void;
    const { deps } = fakeDeps([], {
      deleteAccount: () => new Promise<void>((r) => (release = r)),
    });
    const flow = createAccountDeletion(deps);
    const done = flow.request(true);
    flow.dismiss();
    expect(flow.status().phase).toBe('deleting');
    await vi.waitFor(() => expect(release).toBeDefined());
    release();
    await done;
  });
});

describe('createDeleteAccount', () => {
  it('sends DELETE /account with the token, no cookies and no referrer', async () => {
    const fetchFn = vi.fn(async () => new Response('{"ok":true}', { status: 200 }));
    await createDeleteAccount('https://api.example', fetchFn)('tok');
    expect(fetchFn).toHaveBeenCalledWith('https://api.example/account', {
      method: 'DELETE',
      headers: { authorization: 'Bearer tok' },
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
    });
  });

  it('throws the status for anything but a 200, and "network" when the request fails', async () => {
    const del = createDeleteAccount(
      'https://api.example',
      vi.fn(async () => new Response('', { status: 503 })),
    );
    await expect(del('tok')).rejects.toMatchObject({ message: 'delete', status: 503 });
    const offline = createDeleteAccount(
      'https://api.example',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    await expect(offline('tok')).rejects.toMatchObject({ message: 'network' });
  });
});

describe('waitOrOnline', () => {
  it('resolves after the wait', async () => {
    vi.useFakeTimers();
    const done = vi.fn();
    void waitOrOnline(1000).then(done);
    await vi.advanceTimersByTimeAsync(999);
    expect(done).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toHaveBeenCalled();
  });

  it('resolves as soon as the device is back online', async () => {
    const wait = waitOrOnline(60_000);
    window.dispatchEvent(new Event('online'));
    await expect(wait).resolves.toBeUndefined();
  });
});
