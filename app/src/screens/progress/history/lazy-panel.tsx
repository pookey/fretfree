import { lazy, Suspense, type ComponentType } from 'react';
import type { PanelProps } from '../registry';

/**
 * A Progress panel whose view loads on demand, so the charts stay out of
 * first-load JS (`scripts/check-bundle.mjs`). The service worker precaches
 * every chunk, so it still opens offline.
 */
export function lazyPanel(
  load: () => Promise<{ default: ComponentType<PanelProps> }>,
): ComponentType<PanelProps> {
  const View = lazy(load);
  return function Panel(props: PanelProps) {
    return (
      <Suspense fallback={null}>
        <View {...props} />
      </Suspense>
    );
  };
}
