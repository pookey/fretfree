import type { FretworkDB } from '../../storage';
import type { SessionIntros } from './session';

/**
 * A session's concept intros, loaded on demand so the intros, their card and
 * the gate stay out of first-load JS (design §10). The service worker
 * precaches the chunk. A failed download (offline before the precache)
 * resolves to `null`: the session goes on without intros, and the worked
 * rep still shows the idea.
 */
export function loadSessionIntros(
  db: FretworkDB,
  options: { reviewOnly?: boolean },
): Promise<SessionIntros | null> {
  return import('./session').then(
    (m) => m.openSessionIntros(db, options),
    () => null,
  );
}
