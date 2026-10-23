import { lazy, Suspense } from 'react';
import type { GuitarProps } from './GuitarArt';
import { frameBox } from './frame';
import { guitarLabel } from './label';

export type { GuitarProps } from './GuitarArt';
export { guitarLabel } from './label';
export type * from './types';

/** The renderer's chunk, for callers that need the SVG itself (sharing, M11-09). */
export const loadGuitarArt = () => import('./GuitarArt');

const Art = lazy(() => loadGuitarArt().then((m) => ({ default: m.GuitarArt })));

/**
 * `<Guitar spec size label?>`: a guitar built from resolved parts (design
 * §3.8). The renderer and its body drawings load on first mount, so they
 * add nothing to first-load JS; the service worker precaches the chunk.
 * Until it arrives, a box of the same size holds the guitar's label.
 */
export function Guitar(props: GuitarProps) {
  return (
    <Suspense
      fallback={
        <span
          role="img"
          aria-label={props.label ?? guitarLabel(props.spec)}
          className={props.className}
          style={{ display: 'block', ...frameBox(props.size, props.crop) }}
        />
      }
    >
      <Art {...props} />
    </Suspense>
  );
}
