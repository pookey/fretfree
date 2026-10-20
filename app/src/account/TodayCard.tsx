import { useEffect, useState, useSyncExternalStore } from 'react';
import { Link } from 'react-router';
import { getDb } from '../storage';
import { OFFER_AFTER_SESSIONS } from './limits';
import { dismissOffer, isOfferDismissed, loadAccount, subscribe } from './store';
import styles from './today-card.module.css';

/** Sessions the learner has finished on this device. */
export async function finishedSessions(): Promise<number> {
  return getDb()
    .sessionLogs.filter((s) => s.endedAt !== null)
    .count();
}

/**
 * Today's gentle offer to save progress (M7-04): only once the learner has a
 * few sessions worth keeping, never before, and "Not now" hides it for good on
 * this device. Signing in is never a gate (design §1 principle 8).
 */
export function AccountOfferCard() {
  const signedIn = useSyncExternalStore(subscribe, () => loadAccount() !== null);
  const dismissed = useSyncExternalStore(subscribe, isOfferDismissed);
  const [sessions, setSessions] = useState<number | null>(null);
  const wanted = !signedIn && !dismissed;

  useEffect(() => {
    if (!wanted) return;
    let live = true;
    void finishedSessions().then((n) => live && setSessions(n));
    return () => {
      live = false;
    };
  }, [wanted]);

  if (!wanted || sessions === null || sessions < OFFER_AFTER_SESSIONS) return null;
  return (
    <section className={styles.card} aria-labelledby="account-offer-heading">
      <div className={styles.body}>
        <h2 id="account-offer-heading">Save your progress across devices</h2>
        <p>
          Sign in with just your email to keep a copy of your progress and pick up on another
          device. It’s optional: everything keeps working without it.
        </p>
      </div>
      <div className={styles.actions}>
        <Link to="/progress#account" className={styles.primary}>
          Save my progress
        </Link>
        <button type="button" className={styles.dismiss} onClick={dismissOffer}>
          Not now
        </button>
      </div>
    </section>
  );
}
