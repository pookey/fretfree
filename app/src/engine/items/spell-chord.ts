import { isChordKind, type ChordKind } from '../../theory';
import type { ItemKind, ItemRefs } from '../model';
import { PC, pitchClass } from './helpers';

declare module '../model' {
  interface ItemRefs {
    'spell-chord': { kind: 'spell-chord'; chord: ChordKind; root: string };
  }
}

// Like `spell-key`, the root stays as written: Gb7 and F#7 are different facts.

const SPELL_CHORD_ITEM = new RegExp(`^spell-chord:([A-Za-z0-9]+)@${PC}$`);

/** `spell-chord:m7@B`: spell Bm7, root first (B D F# A). */
export function spellChordItemId(chord: ChordKind, root: string): string {
  if (!isChordKind(chord)) throw new RangeError(`Invalid chord kind: ${String(chord)}`);
  return `spell-chord:${chord}@${pitchClass(root)}`;
}

export function parseSpellChordItemId(id: string): { chord: ChordKind; root: string } | null {
  const m = SPELL_CHORD_ITEM.exec(id);
  if (!m || !isChordKind(m[1] as string)) return null;
  return { chord: m[1] as ChordKind, root: m[2] as string };
}

export default {
  kinds: ['spell-chord'],
  id: (ref) => spellChordItemId(ref.chord, ref.root),
  parse(id) {
    const spellChord = parseSpellChordItemId(id);
    return spellChord && { kind: 'spell-chord', ...spellChord };
  },
} satisfies ItemKind<ItemRefs['spell-chord']>;
