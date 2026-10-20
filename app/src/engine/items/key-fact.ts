import type { ItemKind, ItemRefs } from '../model';
import { PC, pitchClass } from './helpers';

declare module '../model' {
  interface ItemRefs {
    'key-fact': { kind: 'key-signature' | 'relative-minor' | 'dominant'; tonic: string };
  }
}

// Key facts (I3) keep the major tonic as written, as spelling items do: Gb
// major has 6 flats and F# major 6 sharps, so they are different facts.

const KEY_FACT_ITEM = new RegExp(`^(key-signature|relative-minor|dominant):${PC}$`);

/**
 * `key-signature:Eb`: how many sharps or flats E♭ major has, and which (3:
 * B♭ E♭ A♭). `relative-minor:Eb` is its relative minor (C minor) and
 * `dominant:Eb` its V (B♭), all from the major key's tonic.
 */
export function keyFactItemId(
  kind: 'key-signature' | 'relative-minor' | 'dominant',
  tonic: string,
): string {
  return `${kind}:${pitchClass(tonic)}`;
}

export function parseKeyFactItemId(
  id: string,
): { kind: 'key-signature' | 'relative-minor' | 'dominant'; tonic: string } | null {
  const m = KEY_FACT_ITEM.exec(id);
  if (!m) return null;
  return {
    kind: m[1] as 'key-signature' | 'relative-minor' | 'dominant',
    tonic: m[2] as string,
  };
}

export default {
  kinds: ['key-signature', 'relative-minor', 'dominant'],
  id: (ref) => keyFactItemId(ref.kind, ref.tonic),
  parse: parseKeyFactItemId,
} satisfies ItemKind<ItemRefs['key-fact']>;
