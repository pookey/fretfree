import { parseCapoItemId, type Item } from '../../engine/model';
import { OPEN_SHAPE_KEYS, parseKey, sameKey, type MusicalKey } from '../../theory';

/**
 * D13's eager half (design §6, §10): what the session planner needs before
 * the drill's logic has loaded. Keep it small; prompts and grading belong
 * in `logic.ts`.
 */

export const D13_ID = 'capo';

export type D13Ask = 'sound' | 'shape' | 'fret';

/**
 * Scope levels (research/02 rule 5): 0 keeps the capo to frets 1–4 and
 * offers four buttons, 1 reaches fret 7 with six, and 2 offers every key (or
 * frets 1–11). Values live in `engine/config/capo.ts`.
 */
export const D13_SCOPE = { minLevel: 0, maxLevel: 2 };

const ASK_OF = {
  'capo-sound': 'sound',
  'capo-shape': 'shape',
  'capo-fret': 'fret',
} as const satisfies Record<string, D13Ask>;

/** What a capo item asks, and the shapes its card names; null for items D13 doesn't ask. */
export function d13Parse(item: Item): { ask: D13Ask; shape: MusicalKey } | null {
  const ref = parseCapoItemId(item.id);
  if (!ref) return null;
  const shape = parseKey(ref.shape);
  // Only the open shapes beginners play under a capo (C A G E D, Am Em Dm).
  if (!OPEN_SHAPE_KEYS.some((k) => sameKey(k, shape) && k.tonic === shape.tonic)) return null;
  return { ask: ASK_OF[ref.kind], shape };
}

export function d13CanTest(item: Item): boolean {
  return d13Parse(item) !== null;
}

export function d13ConceptOf(item: Item): string | null {
  const p = d13Parse(item);
  if (!p) return null;
  return p.ask === 'shape' ? 'capo:down' : 'capo:up';
}
