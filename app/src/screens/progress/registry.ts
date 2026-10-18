import type { ComponentType } from 'react';
import { ordered, type Ordered } from '../../registry';

export interface PanelProps {
  /** Bumps whenever a panel changes the stored data (an import, say), so others reload. */
  revision: number;
  /** Tell the other panels the stored data changed. */
  onDataChanged(): void;
}

/** What every `progress/panels/<id>.tsx` file exports. A `title` renders as the panel's heading. */
export interface ProgressPanel extends Ordered {
  title?: string;
  Panel: ComponentType<PanelProps>;
}

/**
 * The panels on Progress (design §7), top to bottom by `order`. One file per
 * panel: each `panels/<id>.tsx` is registered automatically.
 */
export const PROGRESS_PANELS: readonly ProgressPanel[] = ordered(
  import.meta.glob<ProgressPanel>(['./panels/*.tsx', '!./panels/*.test.tsx'], { eager: true }),
);
