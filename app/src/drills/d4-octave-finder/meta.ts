import { parseOctaveItemId, parseOctavesItemId, type Item } from '../../engine/model';
import {
  chromaOf,
  chromaToPc,
  octaveOnString,
  stringCount,
  type Position,
  type Tuning,
} from '../../theory';
import type { DrillContext } from '../types';

/**
 * D4's eager half (design §6, §10): what the session planner needs before
 * the drill's logic has loaded. Keep it small; prompts and grading belong
 * in `logic.ts`. The shape label is here because it is the confusion
 * concept of a single item.
 */

export const D4_ID = 'octave-finder';

/**
 * Adaptive scope for single items (design §3.3 step 4, research/02 rule 5):
 *
 * - `string` (0): only the octave's string is live; the others are dimmed.
 * - `neck` (1): every string is live, so the learner also picks the string.
 *
 * Every-octave items always use every string in frets 0–12.
 */
export type D4Scope = 'string' | 'neck';

export const D4_SCOPES: readonly D4Scope[] = ['string', 'neck'];
export const D4_SCOPE = { minLevel: 0, maxLevel: D4_SCOPES.length - 1 };

export function d4CanTest(item: Item): boolean {
  return parseOctaveItemId(item.id) !== null || parseOctavesItemId(item.id) !== null;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/** "2 strings up, 3 frets higher": up is toward string 1, higher toward the body. */
export function d4ShapeLabel(from: number, to: number, offset: number): string {
  const strings = `${plural(Math.abs(from - to), 'string')} ${to < from ? 'up' : 'down'}`;
  if (offset === 0) return `${strings}, same fret`;
  return `${strings}, ${plural(Math.abs(offset), 'fret')} ${offset > 0 ? 'higher' : 'lower'}`;
}

export interface D4SingleShape {
  target: Position;
  offset: number;
  shape: string;
}

/** A single item's octave on its string, its fret offset and its shape label. */
export function d4SingleShape(
  from: Position,
  string: number,
  tuning: Tuning,
): D4SingleShape | null {
  const target = octaveOnString(from, string, tuning);
  if (!target) return null;
  const offset = target.fret - from.fret;
  return { target, offset, shape: d4ShapeLabel(from.string, string, offset) };
}

export function d4ConceptOf(
  item: Item,
  ctx: Pick<DrillContext, 'tuning' | 'accidentalPref'>,
): string | null {
  const single = parseOctaveItemId(item.id);
  if (single) {
    const n = stringCount(ctx.tuning);
    if (single.from.string > n || single.string > n) return null;
    return d4SingleShape(single.from, single.string, ctx.tuning)?.shape ?? null;
  }
  const every = parseOctavesItemId(item.id);
  return every ? chromaToPc(chromaOf(every.pc), ctx.accidentalPref) : null;
}
