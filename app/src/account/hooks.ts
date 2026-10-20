import { useEffect, useState, useSyncExternalStore } from 'react';
import { loadAccount, loadPending, subscribe, type Account, type PendingSignIn } from './store';

/** The signed-in account on this device, or null. Updates when it changes in any tab. */
export function useAccount(): Account | null {
  return useSyncExternalStore(subscribe, loadAccount, () => null);
}

/** The emailed code waiting to be typed, or null. */
export function usePending(): PendingSignIn | null {
  return useSyncExternalStore(subscribe, loadPending, () => null);
}

/** `Date.now()`, re-read every second while `ticking`, for countdowns. */
export function useNow(ticking: boolean): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!ticking) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [ticking]);
  return now;
}
