import { CAGED_ORDER, isChordKind, type CagedShapeName, type ChordKind } from '../../theory';
import type { ItemKind, ItemRefs } from '../model';

declare module '../model' {
  interface ItemRefs {
    'chord-name': { kind: 'chord-name'; shape: CagedShapeName; chord: ChordKind };
  }
}

const CHORD_NAME_ITEM = /^chord-name:([CAGED])-shape@([A-Za-z0-9]+)$/;

/**
 * `chord-name:A-shape@m7`: name the chord from its dots (D36), root then
 * quality, for a m7 voicing from the A-shape family. The root and neck
 * position vary per prompt, so one card holds the shape-and-quality pairing
 * in every key (research/02 rule 12).
 */
export function chordNameItemId(shape: CagedShapeName, chord: ChordKind): string {
  if (!CAGED_ORDER.includes(shape)) throw new RangeError(`Invalid CAGED shape: ${String(shape)}`);
  if (!isChordKind(chord)) throw new RangeError(`Invalid chord kind: ${String(chord)}`);
  return `chord-name:${shape}-shape@${chord}`;
}

export function parseChordNameItemId(
  id: string,
): { shape: CagedShapeName; chord: ChordKind } | null {
  const m = CHORD_NAME_ITEM.exec(id);
  const chord = m?.[2] as string;
  if (!m || !isChordKind(chord)) return null;
  return { shape: m[1] as CagedShapeName, chord };
}

export default {
  kinds: ['chord-name'],
  id: (ref) => chordNameItemId(ref.shape, ref.chord),
  parse(id) {
    const chordName = parseChordNameItemId(id);
    return chordName && { kind: 'chord-name', ...chordName };
  },
} satisfies ItemKind<ItemRefs['chord-name']>;
