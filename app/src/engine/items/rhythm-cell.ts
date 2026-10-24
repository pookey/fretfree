import { RHYTHM_CELLS, rhythmCellId } from '../../theory/rhythm';
import type { ItemKind, ItemRefs } from '../model';

/**
 * Rhythm cells (R4; D27 "Rhythm reading"; design §12): `rhythm:dotted-8th-16th`,
 * a short written rhythm to read and tap against a click. The catalogue, with
 * each cell's notation, teaching stage and confusable partner, is
 * `RHYTHM_CELLS` in `theory/rhythm.ts`.
 *
 * The bar a cell is read in, its meter and its tempo vary per prompt, so a
 * card is the cell, not one bar of it (research/02 rule 12).
 */

declare module '../model' {
  interface ItemRefs {
    'rhythm-cell': { kind: 'rhythm'; slug: string };
  }
}

type RhythmCellRef = ItemRefs['rhythm-cell'];

const SLUGS: ReadonlySet<string> = new Set(RHYTHM_CELLS.map((c) => c.slug));

const ITEM = /^rhythm:([a-z0-9-]+)$/;

/** `rhythm:dotted-8th-16th`: read and tap a rhythm cell (R4, D27). */
export function rhythmCellItemId(slug: string): string {
  if (!SLUGS.has(slug)) throw new RangeError(`Unknown rhythm cell: ${slug}`);
  return rhythmCellId(slug);
}

export function parseRhythmCellItemId(id: string): RhythmCellRef | null {
  const slug = ITEM.exec(id)?.[1];
  return slug !== undefined && SLUGS.has(slug) ? { kind: 'rhythm', slug } : null;
}

export default {
  kinds: ['rhythm'],
  id: (ref) => rhythmCellItemId(ref.slug),
  parse: parseRhythmCellItemId,
} satisfies ItemKind<RhythmCellRef>;
