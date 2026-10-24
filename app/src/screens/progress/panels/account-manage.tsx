import { lazy, Suspense } from 'react';
import { syncApiUrl } from '../../../account/endpoint';

export const id = 'account-manage';
// Straight after the account panel it belongs to.
export const order = 31;

// Loads with the panel, keeping the delete flow out of first-load JS.
const ManageAccount = lazy(() =>
  import('../../../account/ManageAccount').then((m) => ({ default: m.ManageAccount })),
);

/** Deleting the account (M7-06), or nothing when this build has no accounts. */
export function Panel() {
  if (!syncApiUrl()) return null;
  return (
    <Suspense fallback={null}>
      <ManageAccount />
    </Suspense>
  );
}
