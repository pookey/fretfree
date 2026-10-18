import type { AnyDrillType } from './types';

/**
 * All drill plugins (design §6). One folder per drill: each `<drill>/drill.ts`
 * default-exports a DrillType and is registered automatically, so parallel
 * work packages add drills without editing a shared file.
 */
const modules = import.meta.glob<{ default: AnyDrillType }>('./*/drill.ts', { eager: true });

export const DRILLS: readonly AnyDrillType[] = Object.values(modules)
  .map((m) => m.default)
  .sort((a, b) => a.id.localeCompare(b.id));

const BY_ID = new Map(DRILLS.map((d) => [d.id, d]));

export function getDrill(id: string): AnyDrillType | undefined {
  return BY_ID.get(id);
}
