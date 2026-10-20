import type { ItemKind, ItemRefs } from '../model';
import { PC, pitchClass } from './helpers';

export type CapoItemKind = 'capo-sound' | 'capo-shape' | 'capo-fret';

declare module '../model' {
  interface ItemRefs {
    capo: { kind: CapoItemKind; shape: string };
  }
}

const CAPO_ITEM = new RegExp(`^(capo-sound|capo-shape|capo-fret):${PC}(m?)$`);

/**
 * Capo cards (C10, D13), keyed by the open-shape key the learner fingers
 * (`G`, `Am`). `capo-sound:G`: G shapes with a capo on fret n, which key
 * sounds? `capo-shape:G`: a song in that key with a capo on fret n, which
 * shapes? `capo-fret:G`: a song in a key, played with G shapes, which fret?
 * The capo fret varies per prompt, so one card holds the shape at every
 * capo (research/02 rule 12), the grain of the CAGED cards.
 */
export function capoItemId(kind: CapoItemKind, shape: string): string {
  const m = /^([A-G][#b]?)(m?)$/.exec(shape);
  if (!m) throw new RangeError(`Invalid capo shape key: ${shape}`);
  return `${kind}:${pitchClass(m[1] as string)}${m[2] as string}`;
}

export function parseCapoItemId(id: string): { kind: CapoItemKind; shape: string } | null {
  const m = CAPO_ITEM.exec(id);
  if (!m) return null;
  return { kind: m[1] as CapoItemKind, shape: `${m[2] as string}${m[3] as string}` };
}

export default {
  kinds: ['capo-sound', 'capo-shape', 'capo-fret'],
  id: (ref) => capoItemId(ref.kind, ref.shape),
  parse: parseCapoItemId,
} satisfies ItemKind<ItemRefs['capo']>;
