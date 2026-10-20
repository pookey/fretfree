import type { Item } from '../../engine/model';
import { parseEarFindItemId } from '../../engine/items/ear-find';
import { parseFindItemId } from '../../engine/items/find';
import {
  chromaOf,
  chromaToPc,
  intervalFromSemitones,
  noteAt,
  stringCount,
  type Tuning,
} from '../../theory';
import type { DrillContext } from '../types';

/**
 * D15's eager half (design §6, §10): what the session planner needs before
 * the drill's logic has loaded. Keep it small; prompts and grading belong
 * in `logic.ts`.
 */

export const D15_ID = 'hear-it-find-it';

/**
 * Adaptive scope (design §3.3 step 4, research/02 rule 5), narrowest first,
 * as D2's:
 *
 * - `string` (0): only the named string is live; the other strings are dimmed.
 * - `region` (1): every string is live within frets 0–12, so the learner must
 *   also keep to the named string. The same note on another string is wrong.
 */
export type D15Scope = 'string' | 'region';

export const D15_SCOPES: readonly D15Scope[] = ['string', 'region'];
export const D15_SCOPE = { minLevel: 0, maxLevel: D15_SCOPES.length - 1 };

/**
 * The cards D15 serves. Whether the prompt names the note follows the card,
 * so each card is graded on one fact (research/02 rule 1):
 *
 * - `find:G@s4` (C2): name → position, with the sound alongside (rule 10).
 *   The note is always named, and graded like D2.
 * - `ear-find:G@s4` (I6): sound → position. The note is never named before
 *   the answer: the learner finds it by ear (rule 13).
 */
export interface D15Card {
  pc: string;
  string: number;
  byEar: boolean;
}

export function d15CardOf(item: Item): D15Card | null {
  const find = parseFindItemId(item.id);
  if (find) return { ...find, byEar: false };
  const ear = parseEarFindItemId(item.id);
  return ear && { ...ear, byEar: true };
}

export function d15CanTest(item: Item): boolean {
  return d15CardOf(item) !== null;
}

/** The fret that sounds a pitch class above its open string: 1–12, never 0 (unison). */
export function d15TargetFret(pc: string, string: number, tuning: Tuning): number {
  const open = noteAt({ string, fret: 0 }, tuning).chroma;
  return (chromaOf(pc) - open + 12) % 12 || 12;
}

/** By ear, the interval over the open string (`ear:P4`): what an ear miss confuses. */
export function d15EarConcept(fret: number): string {
  return `ear:${intervalFromSemitones(fret)}`;
}

/**
 * The confusion-matrix key. A named card is keyed by pitch class, as D2 keys
 * the same cards, so the drills share confusions. An ear card is keyed by
 * its interval over the open string, which is what the ear mistakes.
 */
export function d15ConceptOf(
  item: Item,
  ctx: Pick<DrillContext, 'tuning' | 'accidentalPref'>,
): string | null {
  const card = d15CardOf(item);
  if (!card) return null;
  if (!card.byEar) return chromaToPc(chromaOf(card.pc), ctx.accidentalPref);
  if (card.string > stringCount(ctx.tuning)) return null;
  return d15EarConcept(d15TargetFret(card.pc, card.string, ctx.tuning));
}
