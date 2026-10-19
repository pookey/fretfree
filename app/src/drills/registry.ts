import { resolveView, viewReady } from './lazy-view';
import type { AnyDrillType } from './types';

/**
 * All drill plugins (design §6). One folder per drill: each `<drill>/drill.ts`
 * default-exports a DrillType and is registered automatically, so parallel
 * work packages add drills without editing a shared file.
 *
 * The plugins are eager: the session planner needs their logic and metadata.
 * Their views are not: each `drill.ts` takes its `render` and `contextPanel`
 * from `lazyParts`, so the views download, in one chunk, only when a session
 * needs them (design §10 first-load budget).
 */
const modules = import.meta.glob<{ default: AnyDrillType }>('./*/drill.ts', { eager: true });

export const DRILLS: readonly AnyDrillType[] = Object.values(modules)
  .map((m) => m.default)
  .sort((a, b) => a.id.localeCompare(b.id));

const BY_ID = new Map(DRILLS.map((d) => [d.id, d]));

export function getDrill(id: string): AnyDrillType | undefined {
  return BY_ID.get(id);
}

/** Downloads a drill's view and context panel, so it renders without a fallback. */
export async function preloadDrill(drill: AnyDrillType): Promise<void> {
  await Promise.all([
    resolveView(drill.render),
    drill.contextPanel ? resolveView(drill.contextPanel) : undefined,
  ]);
}

/** Whether a drill's view and context panel render without suspending. */
export function drillReady(drill: AnyDrillType): boolean {
  return viewReady(drill.render) && (!drill.contextPanel || viewReady(drill.contextPanel));
}
