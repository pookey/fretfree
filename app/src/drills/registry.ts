import { resolveView, viewReady } from './lazy-view';
import type { AnyDrillType } from './types';

/**
 * All drill plugins (design §6). One folder per drill: each `<drill>/drill.ts`
 * default-exports a DrillType and is registered automatically, so parallel
 * work packages add drills without editing a shared file.
 *
 * The plugins are eager, but only as metadata: the session planner needs
 * each drill's skills, scope, `canTest` and `conceptOf`, from its `meta.ts`.
 * Their logic and views are not: each `drill.ts` takes its `logic` from
 * `lazyLogic` and its `render` and `contextPanel` from `lazyParts`, so they
 * download only when a session or placement test needs them (design §10
 * first-load budget). `preloadDrill` fetches both.
 */
const modules = import.meta.glob<{ default: AnyDrillType }>('./*/drill.ts', { eager: true });

export const DRILLS: readonly AnyDrillType[] = Object.values(modules)
  .map((m) => m.default)
  .sort((a, b) => a.id.localeCompare(b.id));

const BY_ID = new Map(DRILLS.map((d) => [d.id, d]));

export function getDrill(id: string): AnyDrillType | undefined {
  return BY_ID.get(id);
}

/**
 * Downloads a drill's logic, view and context panel, so it can make prompts
 * and renders without a fallback.
 */
export async function preloadDrill(drill: AnyDrillType): Promise<void> {
  await Promise.all([
    drill.logic.preload(),
    resolveView(drill.render),
    drill.contextPanel ? resolveView(drill.contextPanel) : undefined,
  ]);
}

/** Whether a drill's logic has loaded, and its view and context panel render without suspending. */
export function drillReady(drill: AnyDrillType): boolean {
  return (
    drill.logic.ready() &&
    viewReady(drill.render) &&
    (!drill.contextPanel || viewReady(drill.contextPanel))
  );
}
