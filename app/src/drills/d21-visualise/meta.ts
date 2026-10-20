import { parseCagedItemId, type Item } from '../../engine/model';

/**
 * D21's eager half (design §6, §10): what the session planner needs before
 * the drill's logic has loaded. Keep it small; prompts and grading belong
 * in `logic.ts`.
 */

export const D21_ID = 'visualise';

/** Which notes of the pictured shape to tap: its roots, its 3rds (♭3s), or its ♭7s. */
export type D21Ask = 'root' | 'third' | 'seventh';

/**
 * Adaptive scope (design §3.3 step 4, research/02 rule 5): how far up the
 * neck the shape may sit (its lowest fret) and which notes to tap. The roots
 * come first (design §6: "picture the A shape at fret 5, then tap the
 * roots"); the 3rds, and a 7 shape's ♭7s, join at the widest scope.
 */
export interface D21Level {
  maxPosition: number;
  asks: readonly D21Ask[];
}

export const D21_LEVELS: readonly D21Level[] = [
  { maxPosition: 5, asks: ['root'] },
  { maxPosition: 12, asks: ['root'] },
  { maxPosition: 12, asks: ['root', 'third', 'seventh'] },
];

export const D21_SCOPE = { minLevel: 0, maxLevel: D21_LEVELS.length - 1 };

/** Whole shapes only: a triad core alone doesn't sit at a position the way a shape does. */
export function d21CanTest(item: Item): boolean {
  return parseCagedItemId(item.id)?.kind === 'caged';
}

export function d21ConceptOf(item: Item): string | null {
  const ref = parseCagedItemId(item.id);
  return ref?.kind === 'caged' ? `caged:${ref.shape}` : null;
}
