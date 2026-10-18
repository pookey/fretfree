import type { AchievementDefinition } from '../types';

/**
 * The achievement registry (design §3.7). One file per badge: every sibling
 * module (`string-6-master.ts`, `streak-7.ts`, …) default-exports an
 * `AchievementDefinition` and is picked up automatically.
 */
const modules = import.meta.glob<{ default: AchievementDefinition }>(
  ['./*.ts', '!./index.ts', '!./check.ts', '!./*.test.ts'],
  { eager: true },
);

export const ACHIEVEMENTS: readonly AchievementDefinition[] = Object.values(modules)
  .map((m) => m.default)
  .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));

export { checkAchievements } from './check';
