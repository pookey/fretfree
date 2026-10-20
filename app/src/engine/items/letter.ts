import type { ItemKind, ItemRefs } from '../model';
import { offset, OFFSET } from './helpers';

declare module '../model' {
  interface ItemRefs {
    letter: { kind: 'letter'; steps: number; from: string };
  }
}

const LETTER_ITEM = new RegExp(`^letter:${OFFSET}@([A-G])$`);

/** `letter:+1@G`: the next letter of the musical alphabet after G (A). */
export function letterItemId(steps: number, from: string): string {
  if (!/^[A-G]$/.test(from)) throw new RangeError(`Invalid letter: ${from}`);
  return `letter:${offset(steps)}@${from}`;
}

export function parseLetterItemId(id: string): { steps: number; from: string } | null {
  const m = LETTER_ITEM.exec(id);
  if (!m) return null;
  return { steps: Number(m[1]), from: m[2] as string };
}

export default {
  kinds: ['letter'],
  id: (ref) => letterItemId(ref.steps, ref.from),
  parse(id) {
    const letter = parseLetterItemId(id);
    return letter && { kind: 'letter', ...letter };
  },
} satisfies ItemKind<ItemRefs['letter']>;
