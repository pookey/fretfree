// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ACCOUNT_KEY,
  dismissOffer,
  isOfferDismissed,
  loadAccount,
  loadPending,
  OFFER_DISMISSED_KEY,
  PENDING_KEY,
  saveAccount,
  savePending,
  subscribe,
} from './store';
import { TOKENS } from './test-fakes';

afterEach(() => {
  saveAccount(null);
  savePending(null);
  localStorage.clear();
  vi.restoreAllMocks();
});

const ACCOUNT = { email: 'a@b.co', tokens: TOKENS, signedInAt: 1 };

describe('account store', () => {
  it('keeps the account in localStorage and returns the same object until it changes', () => {
    saveAccount(ACCOUNT);
    expect(JSON.parse(localStorage.getItem(ACCOUNT_KEY)!)).toEqual(ACCOUNT);
    expect(loadAccount()).toEqual(ACCOUNT);
    expect(loadAccount()).toBe(loadAccount());
  });

  it('ignores what isn’t an account or a pending sign-in', () => {
    localStorage.setItem(ACCOUNT_KEY, '{"email":"a@b.co"}');
    localStorage.setItem(PENDING_KEY, 'not json');
    window.dispatchEvent(new StorageEvent('storage', { key: null }));
    expect(loadAccount()).toBeNull();
    expect(loadPending()).toBeNull();
  });

  it('defaults a pending sign-in’s answer count', () => {
    localStorage.setItem(PENDING_KEY, JSON.stringify({ email: 'a@b.co', sentAt: 1, expiresAt: 2 }));
    window.dispatchEvent(new StorageEvent('storage', { key: PENDING_KEY }));
    expect(loadPending()).toEqual({ email: 'a@b.co', sentAt: 1, expiresAt: 2, codeAnswers: 0 });
  });

  it('tells subscribers about changes here and in other tabs', () => {
    const listener = vi.fn();
    const stop = subscribe(listener);
    saveAccount(ACCOUNT);
    expect(listener).toHaveBeenCalledTimes(1);
    localStorage.removeItem(ACCOUNT_KEY);
    window.dispatchEvent(new StorageEvent('storage', { key: ACCOUNT_KEY }));
    expect(listener).toHaveBeenCalledTimes(2);
    expect(loadAccount()).toBeNull();
    window.dispatchEvent(new StorageEvent('storage', { key: 'fretwork.other' }));
    expect(listener).toHaveBeenCalledTimes(2);
    stop();
    saveAccount(ACCOUNT);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('remembers "Not now" for the offer', () => {
    expect(isOfferDismissed()).toBe(false);
    dismissOffer();
    expect(localStorage.getItem(OFFER_DISMISSED_KEY)).toBe('true');
    expect(isOfferDismissed()).toBe(true);
  });

  it('keeps a value for the page load when storage refuses it', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError');
    });
    saveAccount(ACCOUNT);
    expect(loadAccount()).toEqual(ACCOUNT);
  });
});
