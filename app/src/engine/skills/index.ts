import type { Item, Skill } from '../model';

/**
 * The skill registry (design §3.1, topic IDs from research/03).
 *
 * One file per topic: every sibling module (`f2.ts`, `c3.ts`, …) exports
 * `skills: Skill[]` and is picked up automatically, so parallel work packages
 * add skills by adding files rather than editing a shared list. Skills are
 * ordered by `order` (the default frontier order before goal reordering).
 */
const modules = import.meta.glob<{ skills: Skill[] }>(
  ['./*.ts', '!./index.ts', '!./helpers.ts', '!./*.test.ts'],
  {
    eager: true,
  },
);

export const SKILLS: readonly Skill[] = Object.values(modules)
  .flatMap((m) => m.skills)
  .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));

const BY_ID = new Map(SKILLS.map((s) => [s.id, s]));

export function getSkill(id: string): Skill | undefined {
  return BY_ID.get(id);
}

export function itemsForSkills(skills: readonly Skill[]): Item[] {
  return skills.flatMap((s) => s.items());
}
