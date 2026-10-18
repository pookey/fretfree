import { useRegisterSW } from 'virtual:pwa-register/react';
import styles from './UpdateToast.module.css';

/** Offers to refresh when a new service worker is waiting (design §10 offline). */
export function UpdateToast() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      // Check for updates hourly while the app stays open.
      if (registration) setInterval(() => void registration.update(), 60 * 60 * 1000);
    },
  });
  if (!needRefresh) return null;
  return (
    <div className={styles.toast} role="status">
      <span>A new version of Fretwork is ready.</span>
      <button type="button" onClick={() => void updateServiceWorker(true)}>
        Reload
      </button>
      <button type="button" onClick={() => setNeedRefresh(false)} aria-label="Dismiss">
        ✕
      </button>
    </div>
  );
}
