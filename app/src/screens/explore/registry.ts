import { lazy, type ComponentType } from 'react';
import { ordered, type Ordered } from '../../registry';

/** What every `explore/views/<id>.meta.ts` file exports. */
export interface ExploreViewMeta extends Ordered {
  title: string;
}

/** What every `explore/views/<id>.tsx` file exports. */
export interface ExploreViewModule {
  View: ComponentType;
}

/** A listed view. `View` may be lazy, so render it inside `<Suspense>`. */
export interface ExploreView extends ExploreViewMeta {
  View: ComponentType;
}

/**
 * Pairs each `<id>.meta.ts` with its `<id>.tsx` loader, sorted by `order`.
 * The metadata is eager so the view list renders at once; each view's
 * component loads on first render, keeping Explore out of first-load JS
 * (design §10). Throws, naming the file, if either half is missing.
 */
export function collectViews(
  metas: Record<string, ExploreViewMeta>,
  loaders: Record<string, () => Promise<ExploreViewModule>>,
): ExploreView[] {
  const unpaired = new Set(Object.keys(loaders));
  const views: Record<string, ExploreView> = {};
  for (const [file, meta] of Object.entries(metas)) {
    const viewFile = file.replace(/\.meta\.ts$/, '.tsx');
    const load = loaders[viewFile];
    if (!load) throw new Error(`${file}: no ${viewFile} to load`);
    unpaired.delete(viewFile);
    views[file] = { ...meta, View: lazy(() => load().then((m) => ({ default: m.View }))) };
  }
  const [orphan] = unpaired;
  if (orphan) throw new Error(`${orphan}: no ${orphan.replace(/\.tsx$/, '.meta.ts')} to list it`);
  return ordered(views);
}

/**
 * The Explore reference tools (design §7), listed by `order`. One view per
 * pair of files: `views/<id>.meta.ts` (id, title, order) and `views/<id>.tsx`
 * (`View`), registered automatically.
 */
export const EXPLORE_VIEWS: readonly ExploreView[] = collectViews(
  import.meta.glob<ExploreViewMeta>('./views/*.meta.ts', { eager: true }),
  import.meta.glob<ExploreViewModule>(['./views/*.tsx', '!./views/*.test.tsx']),
);
