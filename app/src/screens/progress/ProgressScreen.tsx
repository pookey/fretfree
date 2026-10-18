import { useCallback, useState } from 'react';
import { ScreenLayout } from '../../shell/ScreenLayout';
import { PROGRESS_PANELS, type ProgressPanel } from './registry';
import styles from '../screens.module.css';

/** Progress (design §7): the registered panels, top to bottom. Settings live here. */
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
            <Panel revision={revision} onDataChanged={onDataChanged} />
          </section>
        ))}
      </div>
    </ScreenLayout>
  );
}
