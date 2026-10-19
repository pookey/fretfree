import { lazy, type FC } from 'react';

/** A drill component that loads its chunk on demand (design §10 first-load budget). */
export type LazyView<P> = FC<P> & {
  /** Downloads the chunk; resolves to the component. Safe to call often. */
  preload(): Promise<FC<P>>;
};

/**
 * Wraps a drill's view (or context panel) so its code stays out of first-load
 * JS: `render: lazyView(() => import('../views').then((m) => m.D1View))`.
 * Rendered before it has loaded, it suspends, so render it inside
 * `<Suspense>`. Once `preload()` has resolved it renders synchronously, so a
 * session that preloads the next drill never shows a fallback.
 */
export function lazyView<P extends object>(load: () => Promise<FC<P>>): LazyView<P> {
  let loaded: FC<P> | undefined;
  let pending: Promise<FC<P>> | undefined;
  const preload = () =>
    (pending ??= load().then(
      (c) => (loaded = c),
      (e: unknown) => {
        // A failed download (offline before the precache) can be retried later.
        pending = undefined;
        throw e;
      },
    ));
  const Suspending = lazy(() => preload().then((c) => ({ default: c })));
  const View = (props: P) => {
    const C = loaded;
    return C ? <C {...props} /> : <Suspending {...props} />;
  };
  return Object.assign(View, { preload });
}

function isLazy<P>(c: FC<P>): c is LazyView<P> {
  return typeof (c as Partial<LazyView<P>>).preload === 'function';
}

/** The component behind a view, loading it if it's lazy. */
export function resolveView<P>(c: FC<P>): Promise<FC<P>> {
  return isLazy(c) ? c.preload() : Promise.resolve(c);
}
