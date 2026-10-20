import { isChordKind, type ChordKind } from '../../theory';
import type { ItemKind, ItemRefs } from '../model';
import { count, INT } from './helpers';

declare module '../model' {
  interface ItemRefs {
    'build-chord': { kind: 'build-chord'; chord: ChordKind; string: number };
  }
}

const BUILD_CHORD_ITEM = new RegExp(`^build-chord:([A-Za-z0-9]+)@s${INT}$`);

/**
 * `build-chord:m7@s5`: build a m7 voicing from a root on string 5 (D38,
 * symbol → voicing). The root and its fret vary per prompt, and any playable
 * voicing with the chord's tones counts, so one card holds the chord kind
 * from that root string in every key (research/02 rule 12).
 */
export function buildChordItemId(chord: ChordKind, string: number): string {
  if (!isChordKind(chord)) throw new RangeError(`Invalid chord kind: ${String(chord)}`);
  if (count(string, 'string') < 1) throw new RangeError(`Invalid string: ${string}`);
  return `build-chord:${chord}@s${string}`;
}

export function parseBuildChordItemId(id: string): { chord: ChordKind; string: number } | null {
  const m = BUILD_CHORD_ITEM.exec(id);
  const chord = m?.[1] as string;
  const string = Number(m?.[2]);
  if (!m || !isChordKind(chord) || string < 1) return null;
  return { chord, string };
}

export default {
  kinds: ['build-chord'],
  id: (ref) => buildChordItemId(ref.chord, ref.string),
  parse(id) {
    const buildChord = parseBuildChordItemId(id);
    return buildChord && { kind: 'build-chord', ...buildChord };
  },
} satisfies ItemKind<ItemRefs['build-chord']>;
