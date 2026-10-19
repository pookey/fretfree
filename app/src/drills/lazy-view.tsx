import { lazy, type FC } from 'react';
import type { DrillLogic, LazyLogic } from './types';
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
  const chunk = onDemand(load);
  const Suspending = lazy(() => chunk.preload().then((c) => ({ default: c })));
  const View = (props: P) => {
    const C = chunk.loaded();
    return C ? <C {...props} /> : <Suspending {...props} />;
  };
  return Object.assign(View, { preload: chunk.preload, ready: () => chunk.loaded() !== undefined });
}

/** Loads once, and keeps the result; a failed load is tried again on the next call. */
function onDemand<T>(load: () => Promise<T>): { preload(): Promise<T>; loaded(): T | undefined } {
  let loaded: T | undefined;
  let pending: Promise<T> | undefined;
  const preload = () =>
    (pending ??= load().then(
      (c) => (loaded = c),
      (e: unknown) => {
        // A failed download (offline before the precache) can be retried later.
        pending = undefined;
        throw e;
      },
    ));
  return { preload, loaded: () => loaded };
}

/**
 * The logic of the drill in `drills/<folder>/`, loaded on demand from its
 * `logic.ts` (design §6, §10). Every drill's `drill.ts` does
 *
 *     import type * as logic from './logic';
 *     const lazy = lazyLogic('d1-name-the-note', (l: typeof logic) => ({
 *       makePrompt: l.d1MakePrompt, check: l.d1Check, …
 *     }));
 *
 * and never imports `logic.ts` itself, which would put it back in
 * first-load JS. What the planner needs eagerly (ID, scope, `canTest`,
 * `conceptOf`) lives in the drill's `meta.ts`. All drills' logic shares one
 * chunk (`drills/logics.ts`).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyLogic<M, L extends DrillLogic<any, any>>(
  folder: string,
  pick: (logic: M) => L,
): LazyLogic<L> {
  const chunk = onDemand(() => import('./logics').then((m) => pick(m.logicOf(folder) as M)));
  return {
    preload: chunk.preload,
    ready: () => chunk.loaded() !== undefined,
    get() {
      const l = chunk.loaded();
      if (!l) throw new Error(`drills/${folder}/logic.ts hasn’t loaded: await preloadDrill first`);
      return l;
    },
  };
}

type PropsOf<C> = C extends FC<infer P> ? P : never;

/** A drill's lazy parts, typed from its `views.ts`. */
export type LazyParts<V> = { [K in keyof V]-?: LazyView<PropsOf<NonNullable<V[K]>>> };

/**
 * The view and context panel of the drill in `drills/<folder>/`, loaded on
 * demand from its `views.ts` (design §6). Every drill's `drill.ts` does
 *
 *     import type * as views from './views';
 *     const parts = lazyParts<typeof views>('d1-name-the-note', lazy);
 *     … logic: lazy, render: parts.render, contextPanel: parts.contextPanel …
 *
 * with `lazy` from `lazyLogic`, and never imports its view directly, which
 * would put it back in first-load JS. All drills' views share one chunk
 * (`drills/views.ts`). A view can't work without its drill's logic, so it
 * loads that too: a view that has loaded can render its prompt, and a failed
 * logic download shows where the view would, as the drill's load-failed
 * message (`DrillLoadFailed`).
 */
export function lazyParts<V extends DrillViews>(
  folder: string,
  logic: Pick<LazyLogic<unknown>, 'preload'>,
): LazyParts<V> {
  const part = (key: keyof DrillViews) =>
    lazyView((): Promise<FC<object>> =>
      Promise.all([import('./views'), logic.preload()]).then(([m]) => {
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
