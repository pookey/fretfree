import { createElement, lazy, Suspense, type ComponentType, type ReactNode } from 'react';

/**
 * A route element whose screen loads on demand, for screens most learners
 * open rarely (onboarding, the placement retake), keeping them out of
 * first-load JS (design §10). The service worker precaches the chunk, so the
 * route still opens offline. Shows a status while the chunk downloads.
 */
export function lazyElement(load: () => Promise<ComponentType>, title: string): ReactNode {
  const Screen = lazy(() => load().then((c) => ({ default: c })));
  const fallback = createElement('p', { role: 'status' }, `Loading ${title}…`);
  return createElement(Suspense, { fallback }, createElement(Screen));
}
