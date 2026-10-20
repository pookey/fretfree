import { CAGED_ORDER, CAGED_QUALITIES, type CagedQuality, type CagedShapeName } from '../../theory';
import type { ItemKind, ItemRefs } from '../model';

declare module '../model' {
  interface ItemRefs {
    caged: { kind: 'caged' | 'caged-core'; shape: CagedShapeName; quality: CagedQuality };
  }
}

const CAGED_ITEM = /^(caged|caged-core):([CAGED])-shape@(major|minor|dominant7)$/;

/**
 * `caged:A-shape@major`: build the whole A shape of a major chord from its
 * root (C6). `caged-core:A-shape@major` builds only its triad core. The root
 * varies per prompt, so one card holds the shape in every key (research/02
 * rule 12). A dominant-7 shape's core is the major one, so it has no core card.
 */
export function cagedItemId(
  kind: 'caged' | 'caged-core',
  shape: CagedShapeName,
  quality: CagedQuality,
): string {
  if (!CAGED_ORDER.includes(shape)) throw new RangeError(`Invalid CAGED shape: ${String(shape)}`);
  if (!CAGED_QUALITIES.includes(quality) || (kind === 'caged-core' && quality === 'dominant7')) {
    throw new RangeError(`Invalid ${kind} quality: ${String(quality)}`);
  }
  return `${kind}:${shape}-shape@${quality}`;
}

export function parseCagedItemId(
  id: string,
): { kind: 'caged' | 'caged-core'; shape: CagedShapeName; quality: CagedQuality } | null {
  const m = CAGED_ITEM.exec(id);
  if (!m || (m[1] === 'caged-core' && m[3] === 'dominant7')) return null;
  return {
    kind: m[1] as 'caged' | 'caged-core',
    shape: m[2] as CagedShapeName,
    quality: m[3] as CagedQuality,
  };
}

export default {
  kinds: ['caged', 'caged-core'],
  id: (ref) => cagedItemId(ref.kind, ref.shape, ref.quality),
  parse: parseCagedItemId,
} satisfies ItemKind<ItemRefs['caged']>;
