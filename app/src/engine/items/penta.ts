import { BOX_NUMBERS, type BoxNumber, type PentatonicQuality } from '../../theory';
import type { ItemKind, ItemRefs } from '../model';

declare module '../model' {
  interface ItemRefs {
    penta: { kind: 'penta-box' | 'penta-relative'; box: BoxNumber; quality: PentatonicQuality };
  }
}

const PENTA_ITEM = /^(penta-box|penta-relative):([1-5])@(major|minor)$/;

/**
 * `penta-box:1@minor`: build minor pentatonic box 1 around its CAGED shape
 * (C7). `penta-relative:1@minor` finds the relative major's root in that box.
 * The root and neck position vary per prompt, so one card holds the box in
 * every key (research/02 rule 12).
 */
export function pentaItemId(
  kind: 'penta-box' | 'penta-relative',
  box: BoxNumber,
  quality: PentatonicQuality,
): string {
  if (!BOX_NUMBERS.includes(box)) throw new RangeError(`Invalid box: ${String(box)}`);
  if (quality !== 'major' && quality !== 'minor') {
    throw new RangeError(`Invalid pentatonic quality: ${String(quality)}`);
  }
  return `${kind}:${box}@${quality}`;
}

export function parsePentaItemId(
  id: string,
): { kind: 'penta-box' | 'penta-relative'; box: BoxNumber; quality: PentatonicQuality } | null {
  const m = PENTA_ITEM.exec(id);
  if (!m) return null;
  return {
    kind: m[1] as 'penta-box' | 'penta-relative',
    box: Number(m[2]) as BoxNumber,
    quality: m[3] as PentatonicQuality,
  };
}

export default {
  kinds: ['penta-box', 'penta-relative'],
  id: (ref) => pentaItemId(ref.kind, ref.box, ref.quality),
  parse: parsePentaItemId,
} satisfies ItemKind<ItemRefs['penta']>;
