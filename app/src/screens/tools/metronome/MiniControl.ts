import type { MetronomeController } from './controller';
import styles from './MiniControl.module.css';

/**
 * Stands in for the metronome's view while its click runs and the view is
 * closed: elsewhere in Tools, or anywhere once the learner pinned it on. The
 * click can always be stopped from the screen the learner is on.
 *
 * Plain DOM beside the app, not React: the view that started the click may be
 * gone, the shell is not the metronome's to edit, and a second React root
 * would split react-dom out of the entry chunk (first-load JS budget).
 */
export function mountMiniControl(
  controller: MetronomeController,
  doc: Document = document,
): () => void {
  const region = doc.createElement('div');
  region.className = styles.mini!;
  region.setAttribute('role', 'region');
  region.setAttribute('aria-label', 'Metronome');
  region.dataset.metronomeMini = '';

  const text = doc.createElement('span');
  text.className = styles.text!;
  const note = doc.createElement('span');
  note.setAttribute('aria-hidden', 'true');
  note.textContent = '♩ ';
  const bpm = doc.createElement('span');
  text.append(note, bpm);

  const stop = doc.createElement('button');
  stop.type = 'button';
  stop.className = styles.stop!;
  stop.textContent = 'Stop metronome';
  stop.addEventListener('click', () => controller.stop());

  region.append(text, stop);

  const render = () => {
    const state = controller.getState();
    const show = state.running && !state.viewOpen;
    bpm.textContent = `${state.bpm} BPM`;
    if (show && !region.isConnected) doc.body.append(region);
    if (!show && region.isConnected) region.remove();
  };
  render();
  const off = controller.subscribe(render);
  return () => {
    off();
    region.remove();
  };
}

let installed = false;

/** Mounts the mini control once for the app's metronome tool. */
export function installMiniControl(controller: MetronomeController, doc: Document = document) {
  if (installed) return;
  installed = true;
  mountMiniControl(controller, doc);
}
