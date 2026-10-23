import { Component, useCallback, useState, type ReactNode } from 'react';
import { ScreenLayout } from '../../shell/ScreenLayout';
import { PROGRESS_PANELS, type ProgressPanel } from './registry';
import styles from '../screens.module.css';

/** Progress (design §7): the registered panels, top to bottom. */
export function ProgressScreen({
  panels = PROGRESS_PANELS,
}: {
  panels?: readonly ProgressPanel[];
}) {
  const [revision, setRevision] = useState(0);
  const onDataChanged = useCallback(() => setRevision((r) => r + 1), []);
  return (
    <ScreenLayout title="Progress">
      <div className={styles.panels}>
        {panels.map(({ id, title, Panel }) => (
          <section
            key={id}
            aria-labelledby={title ? `progress-panel-${id}` : undefined}
            data-progress-panel={id}
          >
            {title && (
              <h2 id={`progress-panel-${id}`} className={styles.sectionTitle}>
                {title}
              </h2>
            )}
            <PanelBoundary>
              <Panel revision={revision} onDataChanged={onDataChanged} />
            </PanelBoundary>
          </section>
        ))}
      </div>
    </ScreenLayout>
  );
}

/**
 * One panel that throws while rendering (bad stored data, say) shows a note
 * instead of taking every other panel on the screen down with it.
 */
class PanelBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(error: unknown) {
    console.error('A Progress panel failed', error);
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <p className={styles.muted}>This panel couldn’t be shown. The rest of Progress is fine.</p>
    );
  }
}
