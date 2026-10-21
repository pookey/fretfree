import type { Outcomes } from './types';

/**
 * The skill-outcome registry (M10-07). One file per topic, named after it
 * (`f1.ts`, `c5.ts`, `tab.ts`), each default-exporting `Outcomes` for its
 * skills and picked up automatically. Learn loads it on demand (`./lazy`),
 * so it stays out of first-load JS; `Skill` itself carries only a title.
 */
const modules = import.meta.glob<{ default: Outcomes }>(
  ['./*.ts', '!./index.ts', '!./lazy.ts', '!./types.ts', '!./*.test.ts'],
  { eager: true },
);

export const OUTCOMES: ReadonlyMap<string, string> = new Map(
  Object.values(modules).flatMap((m) => Object.entries(m.default)),
);

/** What a skill lets the learner do, or `undefined` if it has no outcome yet. */
export function outcomeFor(skillId: string): string | undefined {
  return OUTCOMES.get(skillId);
}

export type { Outcomes } from './types';
