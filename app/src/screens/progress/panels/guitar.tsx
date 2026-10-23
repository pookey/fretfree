import { lazy, Suspense } from 'react';
import type { PanelProps } from '../registry';

export const id = 'guitar';
// After the calendar, before the achievements whose badges unlock finishes.
export const order = 14;
export const title = 'Your guitar';

// The guitar and its catalogue lookups load with the panel, outside first-load JS.
const GuitarCard = lazy(() =>
  import('./guitar/GuitarCard').then((m) => ({ default: m.GuitarCard })),
);

/** The equipped build, its name and balance, and "Open the Garage" (design §3.8). */
export function Panel({ revision }: PanelProps) {
  return (
    <Suspense fallback={null}>
      <GuitarCard revision={revision} />
    </Suspense>
  );
}
