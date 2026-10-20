import { useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import type { MetronomeController } from './controller';
import styles from './MiniControl.module.css';

/**
 * Stands in for the metronome's view while its click runs and the view is
 * closed: elsewhere in Tools, or anywhere once the learner pinned it on. The
 * click can always be stopped from the screen the learner is on.
 */
export function MiniControl({ controller }: { controller: MetronomeController }) {
  const state = useSyncExternalStore(controller.subscribe, controller.getState);
  if (!state.running || state.viewOpen) return null;
  return (
    <div className={styles.mini} role="region" aria-label="Metronome">
      <span className={styles.text}>
        <span aria-hidden>♩ </span>
        {state.bpm} BPM
      </span>
      <button type="button" className={styles.stop} onClick={() => controller.stop()}>
        Stop metronome
      </button>
    </div>
  );
}

let installed = false;

/**
 * Mounts the mini control once, in its own root beside the app: the view that
 * started the click may be gone, and the shell is not the metronome's to edit.
 */
export function installMiniControl(controller: MetronomeController, doc: Document = document) {
  if (installed) return;
  installed = true;
  const host = doc.createElement('div');
  host.dataset.metronomeMini = '';
  doc.body.append(host);
  createRoot(host).render(<MiniControl controller={controller} />);
}
