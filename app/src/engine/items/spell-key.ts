import type { ItemKind, ItemRefs } from '../model';
import { PC, pitchClass } from './helpers';

declare module '../model' {
  interface ItemRefs {
    'spell-key': { kind: 'spell-key'; tonic: string };
  }
}

// Spelling items (C4, C5) keep the tonic or root as written: F# major and Gb
// major are different spellings of the same pitches, so different facts.

const SPELL_KEY_ITEM = new RegExp(`^spell-key:${PC}$`);

/** `spell-key:F#`: spell the F# major scale, tonic first (F# G# A# B C# D# E#). */
export function spellKeyItemId(tonic: string): string {
  return `spell-key:${pitchClass(tonic)}`;
}

export function parseSpellKeyItemId(id: string): { tonic: string } | null {
  const m = SPELL_KEY_ITEM.exec(id);
  if (!m) return null;
  return { tonic: m[1] as string };
}

export default {
  kinds: ['spell-key'],
  id: (ref) => spellKeyItemId(ref.tonic),
  parse(id) {
    const spellKey = parseSpellKeyItemId(id);
    return spellKey && { kind: 'spell-key', ...spellKey };
  },
} satisfies ItemKind<ItemRefs['spell-key']>;
