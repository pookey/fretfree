import { lazy, type FC } from 'react';
import type { DrillViews } from './views';

/** A drill component that loads its chunk on demand (design §10 first-load budget). */
export type LazyView<P> = FC<P> & {
  /** Downloads the chunk; resolves to the component. Safe to call often. */
  preload(): Promise<FC<P>>;
  /** Whether it has loaded, so it renders without suspending. */
  ready(): boolean;
};

/**
 * Wraps a component so its code stays out of first-load JS. Rendered before
 * it has loaded, it suspends, so render it inside `<Suspense>`. Once
 * `preload()` has resolved it renders synchronously, so a session that
 * preloads the next drill never shows a fallback.
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
  return Object.assign(View, { preload, ready: () => loaded !== undefined });
}

type PropsOf<C> = C extends FC<infer P> ? P : never;

/** A drill's lazy parts, typed from its `views.ts`. */
export type LazyParts<V> = { [K in keyof V]-?: LazyView<PropsOf<NonNullable<V[K]>>> };

/**
 * The view and context panel of the drill in `drills/<folder>/`, loaded on
 * demand from its `views.ts` (design §6). Every drill's `drill.ts` does
 *
 *     import type * as views from './views';
 *     const parts = lazyParts<typeof views>('d1-name-the-note');
 *     … render: parts.render, contextPanel: parts.contextPanel …
 *
 * and never imports its view directly, which would put it back in
 * first-load JS. All drills' views share one chunk (`drills/views.ts`).
 */
export function lazyParts<V extends DrillViews>(folder: string): LazyParts<V> {
  const part = (key: keyof DrillViews) =>
    lazyView((): Promise<FC<object>> =>
      import('./views').then((m) => {
        const c = m.viewsOf(folder)[key];
        if (!c) throw new Error(`drills/${folder}/views.ts exports no ${key}`);
        return c;
      }),
    );
  // The props are typed from `V`; at run time each part is what views.ts exports.
  return { render: part('render'), contextPanel: part('contextPanel') } as unknown as LazyParts<V>;
}

function isLazy<P>(c: FC<P>): c is LazyView<P> {
  return typeof (c as Partial<LazyView<P>>).preload === 'function';
}

/** The component behind a view, loading it if it's lazy. */
export function resolveView<P>(c: FC<P>): Promise<FC<P>> {
  return isLazy(c) ? c.preload() : Promise.resolve(c);
}

/** Whether a view renders without suspending. */
export function viewReady<P>(c: FC<P>): boolean {
  return !isLazy(c) || c.ready();
}
