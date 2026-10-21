import type { Skill } from '../../engine';
import type { ConceptIntro } from './types';

/**
 * The concept-intro registry (M10-04). One file per skill or topic, named
 * `<topic>-<slug>.ts`, e.g. `f1-alphabet.ts`. Each default-exports a
 * `ConceptIntro` and is picked up automatically, like the worked examples.
 * Sessions load it on demand (`./lazy`), so it stays out of first-load JS.
 */
const modules = import.meta.glob<{ default: ConceptIntro }>(
  ['./[a-z][0-9]*-*.ts', '!./*.test.ts'],
  { eager: true },
);

export const INTROS: readonly ConceptIntro[] = Object.values(modules)
  .map((m) => m.default)
  .sort((a, b) => a.id.localeCompare(b.id));

/** The intro for a skill: one naming its skill ID, else one naming its topic. */
export function introFor(
  skill: Pick<Skill, 'id' | 'topic'>,
  intros: readonly ConceptIntro[] = INTROS,
): ConceptIntro | undefined {
  return (
    intros.find((i) => i.for.includes(skill.id)) ?? intros.find((i) => i.for.includes(skill.topic))
  );
}

/** Words in an intro's text: runs of letters or digits, so "B–C" is two and "C#" one. */
export function wordCount(text: string): number {
  return text.match(/[\p{L}\p{N}#']+/gu)?.length ?? 0;
}

export type { ConceptIntro, IntroDiagram, NeckDiagram, WheelDiagram } from './types';
