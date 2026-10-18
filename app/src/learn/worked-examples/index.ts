import type { Skill } from '../../engine';
import type { WorkedExample } from './types';

/**
 * The worked-example registry (design §7 Learn, research/02 rule 8).
 *
 * One file per skill or topic, named `<topic>-<slug>.ts` (or `.tsx`), e.g.
 * `c2-gb-octaves.ts`. Each default-exports a `WorkedExample` and is picked
 * up automatically, so parallel work packages add examples by adding files.
 */
const modules = import.meta.glob<{ default: WorkedExample }>(
  ['./[a-z][0-9]*-*.ts', './[a-z][0-9]*-*.tsx', '!./*.test.ts', '!./*.test.tsx'],
  { eager: true },
);

export const WORKED_EXAMPLES: readonly WorkedExample[] = Object.values(modules)
  .map((m) => m.default)
  .sort((a, b) => a.id.localeCompare(b.id));

/** The example for a skill: one naming its skill ID, else one naming its topic. */
export function exampleFor(
  skill: Pick<Skill, 'id' | 'topic'>,
  examples: readonly WorkedExample[] = WORKED_EXAMPLES,
): WorkedExample | undefined {
  return (
    examples.find((e) => e.for.includes(skill.id)) ??
    examples.find((e) => e.for.includes(skill.topic))
  );
}

export type { ExampleStage, ExampleStep, ExampleTrap, WorkedExample } from './types';
