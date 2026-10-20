import { lazy, Suspense } from 'react';
import { syncApiUrl } from '../../../account/endpoint';

export const id = 'account';
// Last: practice first, and the offer is optional and easy to pass over.
export const order = 40;

// The offer and its checks load after first paint, keeping them out of first-load JS.
const AccountOfferCard = lazy(() =>
  import('../../../account/TodayCard').then((m) => ({ default: m.AccountOfferCard })),
);

/** Today's offer to save progress (M7-04), or nothing when this build has no accounts. */
export function Card() {
  if (!syncApiUrl()) return null;
  return (
    <Suspense fallback={null}>
      <AccountOfferCard />
    </Suspense>
  );
}
