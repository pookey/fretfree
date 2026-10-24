import { createAccountApi } from './api';
import { createCognito } from './cognito';
import {
  createAccountDeletion,
  createDeleteAccount,
  waitOrOnline,
  type AccountDeletionFlow,
  type DeletionStatus,
} from './delete';
import { saveDeletedNotice } from './deleted-notice';
import { syncApiUrl } from './endpoint';
import { getDb, type FretworkDB } from '../storage';
import { restartSync, stopSync } from '../storage/sync/engine';

/**
 * Deletes everything FretFree keeps in this browser: the database, and every
 * preference in local storage. Queries fail afterwards rather than quietly
 * making a new, empty database, so the app must reload.
 */
export async function clearThisDevice(
  db: FretworkDB = getDb(),
  storage: Storage = localStorage,
): Promise<void> {
  await db.delete({ disableAutoOpen: true });
  for (const key of Object.keys(storage)) {
    if (key.startsWith('fretwork')) storage.removeItem(key);
  }
}

/**
 * What a finished delete leaves on screen. A cleared device always restarts
 * into onboarding: every screen would otherwise sit on the closed database.
 * A notice says why, after the restart. When progress is kept, the Progress
 * panel says it's done if it is open; anywhere else, the notice does.
 */
export function afterDeletion(
  { keepLocal }: Extract<DeletionStatus, { phase: 'deleted' }>,
  shown: boolean,
  restart: () => void = () => location.replace('/'),
): void {
  if (!keepLocal) {
    saveDeletedNotice('cleared');
    restart();
  } else if (!shown) {
    saveDeletedNotice('kept');
  }
}

let flow: AccountDeletionFlow | null | undefined;

/** This build's account deletion, or null when it has no sync API (accounts are off). */
export function getAccountDeletion(): AccountDeletionFlow | null {
  if (flow === undefined) {
    const url = syncApiUrl();
    const api = url ? createAccountApi(url) : null;
    flow =
      url && api
        ? createAccountDeletion({
            deleteAccount: createDeleteAccount(url),
            cognito: async () => createCognito(await api.config()),
            now: Date.now,
            stopSync,
            restartSync,
            clearLocal: () => clearThisDevice(),
            wait: (ms) => waitOrOnline(ms),
            finished: (status, shown) => afterDeletion(status, shown),
          })
        : null;
  }
  return flow;
}
