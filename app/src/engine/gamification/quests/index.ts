import type { QuestTemplate } from './types';

/**
 * The quest registry (design §3.7 daily quests). One file per quest: every
 * sibling module (`clear-due.ts`, `weak-strings.ts`, …) default-exports a
 * `QuestTemplate` and is picked up automatically. Modules without a default
 * export (shared helpers, the draw) are ignored.
 */
const modules = import.meta.glob<{ default?: QuestTemplate }>(
  ['./*.ts', '!./index.ts', '!./*.test.ts'],
  { eager: true },
);

/** The default-exported templates among `mods`, by id. */
export function templatesFrom(mods: Record<string, { default?: QuestTemplate }>): QuestTemplate[] {
  return Object.values(mods)
    .map((m) => m.default)
    .filter((t): t is QuestTemplate => t !== undefined)
    .sort((a, b) => a.id.localeCompare(b.id));
}

export const QUEST_TEMPLATES: readonly QuestTemplate[] = templatesFrom(modules);

export * from './draw';
export type * from './types';
