import { useState } from 'react';
import { getDb } from '../storage';
import { downloadExport } from '../storage/download-export';
import styles from './MovedNotice.module.css';

/**
 * Hosts the hosted app used to live at, and where it lives now. Progress is
 * stored per origin, so an old host keeps serving the app, with this notice,
 * until learners have exported their data and imported it at the new one.
 */
export const MOVED_HOSTS: Readonly<Record<string, string>> = {
  'guitar.dwellsee.com': 'https://fretfree.app',
};

export function movedTo(hostname: string, moves = MOVED_HOSTS): string | null {
  return Object.hasOwn(moves, hostname) ? (moves[hostname] ?? null) : null;
}

/** Tells learners on an old host to bring their progress to the new one. */
export function MovedNotice({ target }: { target: string }) {
  const [saved, setSaved] = useState<string | null>(null);
  const host = new URL(target).host;
  return (
    <aside className={styles.notice} aria-label={`Moved to ${host}`}>
      <div className={styles.text}>
        <p>
          <strong>This app has moved to {host}.</strong> Your progress is saved in this browser
          only, so bring it with you: export it here, then on {host} open{' '}
          <b>Progress → Your data → Import data</b>.
        </p>
        {saved && (
          <p role="status">
            Saved {saved}. Now open {host} and import it.
          </p>
        )}
      </div>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.primary}
          onClick={() => void downloadExport(getDb()).then(setSaved)}
        >
          Export my progress
        </button>
        <a className={styles.link} href={target}>
          Open {host}
        </a>
      </div>
    </aside>
  );
}
