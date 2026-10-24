import { lazy, Suspense, useSyncExternalStore } from 'react';
import { syncApiUrl } from '../../../account/endpoint';
import { loadDeletion, subscribe } from '../../../account/store';

export const id = 'account';
// Last: practice comes first, and the account is optional (design §1 principle 8).
export const order = 30;

// The sign-in flow loads with the panel, keeping it out of first-load JS.
const AccountPanel = lazy(() =>
  import('../../../account/AccountPanel').then((m) => ({ default: m.AccountPanel })),
);

/** "Save your progress across devices" (M7-04), or nothing when this build has no accounts. */
export function Panel() {
  // While an account delete is in flight, its own panel (account-manage.tsx) says so.
  const deleting = useSyncExternalStore(subscribe, loadDeletion, () => null);
  if (!syncApiUrl() || deleting) return null;
  return (
    <Suspense fallback={null}>
      <AccountPanel />
    </Suspense>
  );
}
