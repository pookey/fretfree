import type { ItemKind, ItemRefs } from '../model';
import { count, INT, PC, pitchClass } from './helpers';

declare module '../model' {
  interface ItemRefs {
    find: { kind: 'find'; pc: string; string: number };
  }
}

const FIND_ITEM = new RegExp(`^find:${PC}@s${INT}$`);

/** `find:G@s5`: find G on string 5 (name → position). */
export function findItemId(pc: string, string: number): string {
  return `find:${pitchClass(pc)}@s${count(string, 'string')}`;
}

export function parseFindItemId(id: string): { pc: string; string: number } | null {
  const m = FIND_ITEM.exec(id);
  if (!m) return null;
  return { pc: m[1] as string, string: Number(m[2]) };
}

export default {
  kinds: ['find'],
  id: (ref) => findItemId(ref.pc, ref.string),
  parse(id) {
    const find = parseFindItemId(id);
    return find && { kind: 'find', ...find };
  },
} satisfies ItemKind<ItemRefs['find']>;
