// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { clearThisDevice, getAccountDeletion } from './delete-client';
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

    await clearThisDevice(db);

    expect(localStorage.getItem('fretwork.installHint.dismissed')).toBeNull();
    expect(localStorage.getItem('fretwork-other')).toBeNull();
    expect(localStorage.getItem('someone-else')).toBe('kept');
    // Closed for good: no query quietly opens a new, empty database.
    await expect(db.sessionLogs.count()).rejects.toThrow();
    const fresh = new FretworkDB('clear-test');
    expect(await fresh.sessionLogs.count()).toBe(0);
    await fresh.delete();
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
