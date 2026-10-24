import { useSyncExternalStore } from 'react';
import { loadDeletedNotice, saveDeletedNotice, subscribeDeletedNotice } from './deleted-notice';
import styles from './deleted-notice.module.css';

const TEXT = {
  kept: 'Your account is deleted. Your progress is still here on this device.',
  cleared: 'Your account is deleted, and so is the progress on this device.',
} as const;

/** One line, on any screen, when an account delete finished away from Progress (M7-06). */
export function DeletedNotice() {
  const notice = useSyncExternalStore(subscribeDeletedNotice, loadDeletedNotice, () => null);
  if (!notice) return null;
  return (
    <div className={styles.notice} role="status" data-testid="deleted-notice">
      <span>{TEXT[notice]}</span>
      <button type="button" onClick={() => saveDeletedNotice(null)}>
        OK
      </button>
    </div>
  );
}
