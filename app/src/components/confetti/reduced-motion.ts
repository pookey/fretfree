import { useSyncExternalStore } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

function media(): MediaQueryList | null {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(QUERY)
    : null;
}

function subscribe(cb: () => void): () => void {
  const mq = media();
  mq?.addEventListener('change', cb);
  return () => mq?.removeEventListener('change', cb);
}

export function prefersReducedMotion(): boolean {
  return media()?.matches ?? false;
}

/** True while the system asks for reduced motion; updates live. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, prefersReducedMotion, () => false);
}
