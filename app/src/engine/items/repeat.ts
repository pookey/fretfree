import type { ItemKind, ItemRefs } from '../model';
import { count, INT, offset, OFFSET } from './helpers';

declare module '../model' {
  interface ItemRefs {
    repeat: { kind: 'repeat'; frets: number; from: number };
  }
}

const REPEAT_ITEM = new RegExp(`^repeat:${OFFSET}@f${INT}$`);

/** `repeat:+12@f3`: fret 3 repeats 12 frets up (at fret 15). */
export function repeatItemId(frets: number, from: number): string {
  return `repeat:${offset(frets)}@f${count(from, 'fret')}`;
}

export function parseRepeatItemId(id: string): { frets: number; from: number } | null {
  const m = REPEAT_ITEM.exec(id);
  if (!m) return null;
  return { frets: Number(m[1]), from: Number(m[2]) };
}

export default {
  kinds: ['repeat'],
  id: (ref) => repeatItemId(ref.frets, ref.from),
  parse(id) {
    const repeat = parseRepeatItemId(id);
    return repeat && { kind: 'repeat', ...repeat };
  },
} satisfies ItemKind<ItemRefs['repeat']>;
