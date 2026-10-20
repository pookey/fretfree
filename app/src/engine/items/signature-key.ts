import type { ItemKind, ItemRefs } from '../model';

declare module '../model' {
  interface ItemRefs {
    'signature-key': { kind: 'signature-key'; alteration: number };
  }
}

const SIGNATURE_KEY_ITEM = /^signature-key:(0|[1-7][#b])$/;

/**
 * `signature-key:3b`: which major key has 3 flats (E♭)? Sharps are `#`, and
 * no sharps or flats is `0`. The alteration counts sharps up, flats down.
 */
export function signatureKeyItemId(alteration: number): string {
  if (!Number.isInteger(alteration) || alteration < -7 || alteration > 7) {
    throw new RangeError(`Invalid key signature: ${alteration}`);
  }
  if (alteration === 0) return 'signature-key:0';
  return `signature-key:${Math.abs(alteration)}${alteration > 0 ? '#' : 'b'}`;
}

export function parseSignatureKeyItemId(id: string): { alteration: number } | null {
  const m = SIGNATURE_KEY_ITEM.exec(id);
  if (!m) return null;
  const sig = m[1] as string;
  if (sig === '0') return { alteration: 0 };
  const n = Number(sig.charAt(0));
  return { alteration: sig.endsWith('#') ? n : -n };
}

export default {
  kinds: ['signature-key'],
  id: (ref) => signatureKeyItemId(ref.alteration),
  parse(id) {
    const signatureKey = parseSignatureKeyItemId(id);
    return signatureKey && { kind: 'signature-key', ...signatureKey };
  },
} satisfies ItemKind<ItemRefs['signature-key']>;
