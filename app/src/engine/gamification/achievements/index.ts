import type { AchievementDefinition } from '../types';

/**
 * The achievement registry (design §3.7). One file per badge: every sibling
 * module (`string-6-master.ts`, `streak-7.ts`, …) default-exports an
 * `AchievementDefinition` and is picked up automatically. Modules without a
 * default export (shared helpers) are ignored.
 */
const modules = import.meta.glob<{ default?: AchievementDefinition }>(
  ['./*.ts', '!./index.ts', '!./check.ts', '!./*.test.ts'],
  { eager: true },
);

/** The default-exported definitions among `mods`, in display order. */
export function definitionsFrom(
  mods: Record<string, { default?: AchievementDefinition }>,
): AchievementDefinition[] {
  return Object.values(mods)
    .map((m) => m.default)
    .filter((d): d is AchievementDefinition => d !== undefined)
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

export const ACHIEVEMENTS: readonly AchievementDefinition[] = definitionsFrom(modules);

export { checkAchievements } from './check';
