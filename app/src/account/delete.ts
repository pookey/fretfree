import { AccountApiError } from './api';
import type { Cognito } from './cognito';
import {
  loadAccount,
  loadDeletion,
  saveAccount,
  saveDeletion,
  savePending,
  type AccountDeletion,
} from './store';

export const DELETE_TIMING = {
  /** The first wait after a failed `DELETE /account`. Each failure in a row doubles it, up to the cap. */
  retryMs: 2000,
  maxRetryMs: 60_000,
  /** Refresh an access token this long before it expires. */
  refreshEarlyMs: 60_000,
} as const;

/** Why the last try didn't finish: no network, or the server didn't say 200. */
export type DeleteTrouble = 'offline' | 'server';

export type DeletionStatus =
  /** No delete asked for, on this page load. */
  | { phase: 'idle' }
  /** Sent, and sent again after each failure, until the server answers 200. */
  | {
      phase: 'deleting';
      email: string;
      keepLocal: boolean;
      /** Why the last try failed, or null before the first answer. */
      trouble: DeleteTrouble | null;
    }
  | { phase: 'deleted'; email: string; keepLocal: boolean }
  /** This device's sign-in ran out before the server said it was done. */
  | { phase: 'sign-in-again'; email: string };

export interface DeletionDeps {
  /** `DELETE /account`: resolves on a 200, and throws an `AccountApiError` otherwise. */
  deleteAccount(token: string): Promise<void>;
  /** The Cognito client, for refreshing the access token. */
  cognito(): Promise<Cognito>;
  /** Epoch ms. */
  now(): number;
  /** Ends syncing on this device at once (`storage/sync/engine.ts`). */
  stopSync(): void;
  /** Deletes this device's progress and preferences. */
  clearLocal(): Promise<void>;
  /** Resolves after `ms`, or sooner when the device comes back online. */
  wait(ms: number): Promise<void>;
}

export interface AccountDeletionFlow {
  status(): DeletionStatus;
  /** Calls `listener` whenever the status changes. */
  subscribe(listener: () => void): () => void;
  /**
   * Deletes the signed-in account: stops syncing, signs this device out, then
   * sends `DELETE /account` until the server answers 200. With `keepLocal`
   * false, this device's progress goes too, once the account is gone.
   */
  request(keepLocal: boolean): Promise<void>;
  /** Carries on with a delete asked for before a reload, or in another tab. */
  resume(): Promise<void>;
  /** Clears the "deleted" or "sign in again" message. */
  dismiss(): void;
}

/** `DELETE /account` (M7-03), with no cookies and no referrer, as the rest of the API. */
export function createDeleteAccount(
  baseUrl: string,
  fetchFn: typeof fetch = fetch,
): (token: string) => Promise<void> {
  return async (token) => {
    let res: Response;
    try {
      res = await fetchFn(`${baseUrl}/account`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${token}` },
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        cache: 'no-store',
      });
    } catch {
      throw new AccountApiError('network');
    }
    if (res.status !== 200) throw new AccountApiError('delete', res.status);
  };
}

const trouble = (error: unknown): DeleteTrouble =>
  error instanceof AccountApiError && error.message === 'network' ? 'offline' : 'server';

/**
 * Account deletion (M7-06). The server's delete is safe to repeat but may
 * need more than one call for a large account, and can fail part way, so it
 * is sent until it answers 200, across reloads, and only then reported as
 * done. Until then the account's other devices get a 410 and sign out.
 */
export function createAccountDeletion(deps: DeletionDeps): AccountDeletionFlow {
  let status: DeletionStatus = { phase: 'idle' };
  let running: Promise<void> | null = null;
  const listeners = new Set<() => void>();
  const set = (next: DeletionStatus) => {
    status = next;
    listeners.forEach((l) => l());
  };

  /** A current access token, or null when the sign-in can't be refreshed. */
  async function token(deletion: AccountDeletion): Promise<string | null> {
    const { tokens } = deletion;
    if (tokens.expiresAt - DELETE_TIMING.refreshEarlyMs > deps.now()) return tokens.accessToken;
    const cognito = await deps.cognito();
    let fresh;
    try {
      fresh = await cognito.refresh(tokens.refreshToken);
    } catch (error) {
      if (error instanceof AccountApiError && error.message === 'NotAuthorizedException') {
        return null;
      }
      throw error;
    }
    const current = loadDeletion();
    if (current?.email === deletion.email) {
      saveDeletion({ ...current, tokens: { ...current.tokens, ...fresh } });
    }
    return fresh.accessToken;
  }

  async function run(): Promise<void> {
    let failures = 0;
    for (;;) {
      const deletion = loadDeletion();
      // Finished in another tab: this one has nothing left to send.
      if (!deletion) {
        if (status.phase === 'deleting') {
          set({ phase: 'deleted', email: status.email, keepLocal: status.keepLocal });
        }
        return;
      }
      const { email, keepLocal } = deletion;
      if (status.phase !== 'deleting') set({ phase: 'deleting', email, keepLocal, trouble: null });
      try {
        const access = await token(deletion);
        if (!access) {
          saveDeletion(null);
          return set({ phase: 'sign-in-again', email });
        }
        await deps.deleteAccount(access);
        if (!keepLocal) await deps.clearLocal();
        saveDeletion(null);
        return set({ phase: 'deleted', email, keepLocal });
      } catch (error) {
        // A refused token is refreshed on the next try.
        if (error instanceof AccountApiError && error.status === 401) {
          const current = loadDeletion();
          if (current) saveDeletion({ ...current, tokens: { ...current.tokens, expiresAt: 0 } });
        }
        set({ phase: 'deleting', email, keepLocal, trouble: trouble(error) });
        failures++;
        await deps.wait(
          Math.min(DELETE_TIMING.retryMs * 2 ** (failures - 1), DELETE_TIMING.maxRetryMs),
        );
      }
    }
  }

  function resume(): Promise<void> {
    if (!loadDeletion()) return Promise.resolve();
    running ??= run().finally(() => (running = null));
    return running;
  }

  return {
    status: () => status,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    request(keepLocal) {
      const account = loadAccount();
      if (!account) return resume();
      // Nothing more is pushed for the account, and this device is signed out
      // at once. The tokens move to the deletion, which still needs them, so
      // they aren't revoked: once the account is gone they are useless.
      deps.stopSync();
      saveDeletion({
        email: account.email,
        tokens: account.tokens,
        keepLocal,
        requestedAt: deps.now(),
      });
      saveAccount(null);
      savePending(null);
      set({ phase: 'deleting', email: account.email, keepLocal, trouble: null });
      return resume();
    },
    resume,
    dismiss() {
      if (status.phase === 'deleted' || status.phase === 'sign-in-again') set({ phase: 'idle' });
    },
  };
}

/** Waits `ms`, or until the browser says it is back online. */
export function waitOrOnline(ms: number, win: Window = window): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      win.removeEventListener('online', done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    win.addEventListener('online', done);
  });
}
