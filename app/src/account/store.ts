import type { Tokens } from './cognito';

/** The signed-in account on this device. */
export interface Account {
  email: string;
  tokens: Tokens;
  /** Epoch ms. */
  signedInAt: number;
}

/** An emailed code waiting to be typed. Times are epoch ms. */
export interface PendingSignIn {
  email: string;
  sentAt: number;
  expiresAt: number;
  /** Code answers sent for this email; the server allows a few (limits.ts). */
  codeAnswers: number;
}

// localStorage, not Dexie: the account is per device and never syncs, exports
// or imports, and signing out must leave every Dexie table as it was.
export const ACCOUNT_KEY = 'fretwork.account';
export const PENDING_KEY = 'fretwork.account.pending';
export const OFFER_DISMISSED_KEY = 'fretwork.account.offerDismissed';

// useSyncExternalStore needs the same object back until something changes.
const cache = new Map<string, unknown>();
function cached<T>(key: string, load: () => T): T {
  if (!cache.has(key)) cache.set(key, load());
  return cache.get(key) as T;
}

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

function read<T>(key: string, valid: (v: Record<string, unknown>) => boolean): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    return value && typeof value === 'object' && valid(value as Record<string, unknown>)
      ? (value as T)
      : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
    cache.delete(key);
  } catch {
    // Storage is blocked or full: keep the value for this page load only.
    cache.set(key, value);
  }
  notify();
}

const isAccount = (v: Record<string, unknown>) =>
  typeof v.email === 'string' &&
  !!v.tokens &&
  typeof (v.tokens as Record<string, unknown>).refreshToken === 'string';
const isPending = (v: Record<string, unknown>) =>
  typeof v.email === 'string' && typeof v.sentAt === 'number' && typeof v.expiresAt === 'number';

export const loadAccount = (): Account | null =>
  cached(ACCOUNT_KEY, () => read<Account>(ACCOUNT_KEY, isAccount));
export const saveAccount = (account: Account | null): void => write(ACCOUNT_KEY, account);

export const loadPending = (): PendingSignIn | null =>
  cached(PENDING_KEY, () => {
    const p = read<PendingSignIn>(PENDING_KEY, isPending);
    return p && { ...p, codeAnswers: Number(p.codeAnswers) || 0 };
  });
export const savePending = (pending: PendingSignIn | null): void => write(PENDING_KEY, pending);

export const isOfferDismissed = (): boolean =>
  cached(OFFER_DISMISSED_KEY, () => {
    try {
      return localStorage.getItem(OFFER_DISMISSED_KEY) === 'true';
    } catch {
      return false;
    }
  });
export const dismissOffer = (): void => write(OFFER_DISMISSED_KEY, true);

/**
 * An account delete the learner asked for and the server hasn't confirmed yet
 * (M7-06). It holds the tokens that `DELETE /account` needs, moved out of the
 * account so this device is signed out and nothing syncs, and it survives a
 * reload so the delete can be sent again until the server says it is done.
 */
export interface AccountDeletion {
  email: string;
  tokens: Tokens;
  /** Keep this device's progress once the account is gone. */
  keepLocal: boolean;
  /** Epoch ms. */
  requestedAt: number;
}

export const DELETION_KEY = 'fretwork.account.deleting';

const isDeletion = (v: Record<string, unknown>) => isAccount(v) && typeof v.keepLocal === 'boolean';

export const loadDeletion = (): AccountDeletion | null =>
  cached(DELETION_KEY, () => read<AccountDeletion>(DELETION_KEY, isDeletion));
export const saveDeletion = (deletion: AccountDeletion | null): void =>
  write(DELETION_KEY, deletion);

/** Calls `listener` whenever the account, pending sign-in or deletion changes, in this tab or another. */
export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// A link opened in another tab of this browser signs this one in too.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === null || e.key.startsWith('fretwork.account')) {
      cache.clear();
      notify();
    }
  });
}
