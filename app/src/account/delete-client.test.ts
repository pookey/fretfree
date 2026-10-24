// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { afterDeletion, clearThisDevice, getAccountDeletion } from './delete-client';
import { loadDeletedNotice, saveDeletedNotice } from './deleted-notice';
import { DELETION_KEY } from './store';
import { FretworkDB } from '../storage/db';

describe('clearThisDevice', () => {
  it('deletes the database and FretFree’s own local storage, and nothing else', async () => {
    const db = new FretworkDB('clear-test');
    await db.sessionLogs.add({
      startedAt: new Date(),
      endedAt: new Date(),
      itemsSeen: 1,
      accuracy: 1,
      uid: 'u1',
    });
    localStorage.setItem('fretwork.installHint.dismissed', 'true');
    localStorage.setItem('fretwork-other', '1');
    localStorage.setItem('someone-else', 'kept');
    localStorage.setItem(DELETION_KEY, '{}');

    await clearThisDevice(db);

    expect(localStorage.getItem('fretwork.installHint.dismissed')).toBeNull();
    expect(localStorage.getItem('fretwork-other')).toBeNull();
    expect(localStorage.getItem('someone-else')).toBe('kept');
    // The waiting delete goes too, so a restart doesn't send it again.
    expect(localStorage.getItem(DELETION_KEY)).toBeNull();
    // Closed for good: no query quietly opens a new, empty database.
    await expect(db.sessionLogs.count()).rejects.toThrow();
    const fresh = new FretworkDB('clear-test');
    expect(await fresh.sessionLogs.count()).toBe(0);
    await fresh.delete();
  });
});

afterEach(() => saveDeletedNotice(null));

describe('afterDeletion', () => {
  const deleted = (keepLocal: boolean) =>
    ({ phase: 'deleted', email: 'a@b.co', keepLocal, confirmed: true }) as const;

  it('restarts a cleared device wherever the learner is, with a notice for after', () => {
    for (const shown of [false, true]) {
      const restart = vi.fn();
      afterDeletion(deleted(false), shown, restart);
      expect(restart).toHaveBeenCalledOnce();
      expect(loadDeletedNotice()).toBe('cleared');
    }
  });

  it('says a kept delete is done only when the Progress panel isn’t showing it', () => {
    const restart = vi.fn();
    afterDeletion(deleted(true), true, restart);
    expect(loadDeletedNotice()).toBeNull();
    afterDeletion(deleted(true), false, restart);
    expect(loadDeletedNotice()).toBe('kept');
    expect(restart).not.toHaveBeenCalled();
  });
});

describe('getAccountDeletion', () => {
  it('is one flow for the page', () => {
    const flow = getAccountDeletion();
    expect(flow).not.toBeNull();
    expect(getAccountDeletion()).toBe(flow);
    expect(flow!.status()).toEqual({ phase: 'idle' });
  });
});
