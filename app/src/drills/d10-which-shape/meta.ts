import { parseCagedItemId, type Item } from '../../engine/model';

/**
 * D10's eager half (design §6, §10): what the session planner needs before
 * the drill's logic has loaded. Keep it small; prompts and grading belong
 * in `logic.ts`.
 */

export const D10_ID = 'which-shape';

/**
 * Adaptive scope (design §3.3 step 4, research/02 rule 5): the roots a prompt
 * may use and how many shapes to choose from. Three choices always include
 * the likeliest mix-up: the shape sharing the root string, or the neighbour
 * the other way along the chain.
 */
export interface D10Level {
  roots: 'naturals' | 'all';
  choices: number;
}

export const D10_LEVELS: readonly D10Level[] = [
  { roots: 'naturals', choices: 3 },
  { roots: 'naturals', choices: 5 },
  { roots: 'all', choices: 5 },
];

export const D10_SCOPE = { minLevel: 0, maxLevel: D10_LEVELS.length - 1 };

export function d10CanTest(item: Item): boolean {
  return parseCagedItemId(item.id)?.kind === 'caged';
}

export function d10ConceptOf(item: Item): string | null {
  const ref = parseCagedItemId(item.id);
  return ref?.kind === 'caged' ? `caged:${ref.shape}` : null;
}
