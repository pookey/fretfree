import type { ItemKind, ItemRefs } from '../model';

declare module '../model' {
  interface ItemRefs {
    'key-apply': { kind: 'key-apply'; letter: string; alteration: number };
  }
}

const KEY_APPLY_ITEM = /^key-apply:([A-G])@(0|[1-7][#b])$/;

/**
 * `key-apply:F@2#`: what an unaltered F on the staff is under a key
 * signature of 2 sharps (F♯), in any octave (R3). The signature counts sharps
 * up and flats down, written as in `signature-key:` (`0`, `3#`, `3b`), so the
 * card is about the signature the learner reads, not a key's name: D major
 * and B minor share the card.
 */
export function keyApplyItemId(letter: string, alteration: number): string {
  if (!/^[A-G]$/.test(letter)) throw new RangeError(`Invalid letter: ${letter}`);
  if (!Number.isInteger(alteration) || alteration < -7 || alteration > 7) {
    throw new RangeError(`Invalid key signature: ${alteration}`);
  }
  const sig = alteration === 0 ? '0' : `${Math.abs(alteration)}${alteration > 0 ? '#' : 'b'}`;
  return `key-apply:${letter}@${sig}`;
}

export function parseKeyApplyItemId(id: string): { letter: string; alteration: number } | null {
  const m = KEY_APPLY_ITEM.exec(id);
  if (!m) return null;
  const sig = m[2] as string;
  const n = sig === '0' ? 0 : Number(sig.charAt(0));
  return { letter: m[1] as string, alteration: sig.endsWith('b') ? -n : n };
}

export default {
  kinds: ['key-apply'],
  id: (ref) => keyApplyItemId(ref.letter, ref.alteration),
  parse(id) {
    const ref = parseKeyApplyItemId(id);
    return ref && { kind: 'key-apply', ...ref };
  },
} satisfies ItemKind<ItemRefs['key-apply']>;
