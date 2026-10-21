import styles from './ContextPanel.module.css';

/**
 * D33's context panel (docs/design/tab-track.md §6): how tab is read. It
 * names only the top line, which the staff keeps as an anchor down to guide
 * level 1; the session hides the panel at level 0 (design §3.5). The other
 * lines' names are the staff's to fade, so the panel never lists them.
 */
export function TabContextPanel() {
  return (
    <div className={styles.panel}>
      <h2>Reading tab</h2>
      <p>
        Each line is a string. The <strong>top line is the high e</strong> (string 1), the one
        nearest the floor as you play.
      </p>
      <p>
        The number is the fret. <strong>0</strong> is the open string.
      </p>
    </div>
  );
}
