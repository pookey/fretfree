import type { ItemKind, ItemRefs } from '../model';
import { PC, pitchClass } from './helpers';

declare module '../model' {
  interface ItemRefs {
    octaves: { kind: 'octaves'; pc: string };
  }
}

const OCTAVES_ITEM = new RegExp(`^octaves:${PC}$`);

/** `octaves:G`: every octave of G across the neck, from one shown G (multi-target). */
export function octavesItemId(pc: string): string {
  return `octaves:${pitchClass(pc)}`;
}

export function parseOctavesItemId(id: string): { pc: string } | null {
  const m = OCTAVES_ITEM.exec(id);
  if (!m) return null;
  return { pc: m[1] as string };
}

export default {
  kinds: ['octaves'],
  id: (ref) => octavesItemId(ref.pc),
  parse(id) {
    const octaves = parseOctavesItemId(id);
    return octaves && { kind: 'octaves', ...octaves };
  },
} satisfies ItemKind<ItemRefs['octaves']>;
