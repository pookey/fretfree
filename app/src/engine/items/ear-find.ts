import type { ItemKind, ItemRefs } from '../model';
import { count, INT, PC, pitchClass } from './helpers';

declare module '../model' {
  interface ItemRefs {
    'ear-find': { kind: 'ear-find'; pc: string; string: number };
  }
}

const EAR_FIND_ITEM = new RegExp(`^ear-find:${PC}@s${INT}$`);

/**
 * `ear-find:G@s4`: hear the open string, then G on string 4, and find it by
 * ear (D15, I6). Its own card, apart from `find:G@s4` (C2's name → position):
 * a miss by ear is a hearing miss, not a gap in knowing the neck
 * (research/02 rule 1).
 */
export function earFindItemId(pc: string, string: number): string {
  return `ear-find:${pitchClass(pc)}@s${count(string, 'string')}`;
}

export function parseEarFindItemId(id: string): { pc: string; string: number } | null {
  const m = EAR_FIND_ITEM.exec(id);
  if (!m) return null;
  return { pc: m[1] as string, string: Number(m[2]) };
}

export default {
  kinds: ['ear-find'],
  id: (ref) => earFindItemId(ref.pc, ref.string),
  parse(id) {
    const ref = parseEarFindItemId(id);
    return ref && { kind: 'ear-find', ...ref };
  },
} satisfies ItemKind<ItemRefs['ear-find']>;
