import { parseIntervalItemId, type Item } from '../../engine/model';
import { intervalShape, type IntervalName } from '../../theory';
import type { DrillContext } from '../types';

/**
 * D6's eager half (design §6, §10): what the session planner needs before
 * the drill's logic has loaded. Keep it small; prompts and grading belong
 * in `logic.ts`.
 */

export const D6_ID = 'interval-tap';

/**
 * Adaptive scope (design §3.3 step 4, research/02 rule 5), narrowest first:
 *
 * - `shape` (0): only the shape's upper string is live, within the hand
 *   position around the root, so the one right cell is the shape itself.
 * - `box` (1): every string is live within the hand position.
 * - `neck` (2): every string is live across frets 0–12.
 */
export type D6Scope = 'shape' | 'box' | 'neck';

export const D6_SCOPES: readonly D6Scope[] = ['shape', 'box', 'neck'];
export const D6_SCOPE = { minLevel: 0, maxLevel: D6_SCOPES.length - 1 };

export const GB_SHIFT_SUFFIX = ' (G–B shift)';

/** The item's interval shape, for an `interval:` item. */
export function tapRef(item: Item) {
  const ref = parseIntervalItemId(item.id);
  return ref?.kind === 'interval' ? ref : null;
}

export function d6CanTest(item: Item): boolean {
  return tapRef(item) !== null;
}

/** The confusion-matrix concept of a shape, e.g. `M3` or `M3 (G–B shift)`. */
export function conceptFor(interval: IntervalName, gbShift: boolean): string {
  return gbShift ? `${interval}${GB_SHIFT_SUFFIX}` : interval;
}

export function d6ConceptOf(
  item: Item,
  ctx: Pick<DrillContext, 'tuning' | 'accidentalPref'>,
): string | null {
  const ref = tapRef(item);
  if (!ref) return null;
  return conceptFor(
    ref.interval,
    intervalShape(ref.interval, ref.from, ref.to, ctx.tuning).gbShift,
  );
}
