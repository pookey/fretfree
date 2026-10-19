import type { FC } from 'react';

/** What every `drills/<folder>/views.ts` exports. */
export interface DrillViews {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  render: FC<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  contextPanel?: FC<any>;
}

/**
 * Every drill's view and context panel (design §6), one file per drill:
 * `drills/<folder>/views.ts` is collected automatically. Only `lazyParts`
 * imports this module, and only dynamically, so the eager glob puts every
 * view in one on-demand chunk: a chunk per view let the bundler move modules
 * they share with the entry into extra first-load chunks (design §10).
 */
const modules = import.meta.glob<DrillViews>('./*/views.ts', { eager: true });

/** The parts of the drill in `drills/<folder>/`. Throws if it has no `views.ts`. */
export function viewsOf(folder: string): DrillViews {
  const views = modules[`./${folder}/views.ts`];
  if (!views) throw new Error(`drills/${folder}/views.ts is missing`);
  return views;
}
