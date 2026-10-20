import type { ItemKind, ItemRefs } from '../model';
import { count, INT } from './helpers';

declare module '../model' {
  interface ItemRefs {
    marker: { kind: 'marker' | 'find-marker'; fret: number };
  }
}

const MARKER_ITEM = new RegExp(`^(marker|find-marker):f${INT}$`);

/** `marker:f7`: which fret is this inlay marker? (position → name) */
export function markerItemId(fret: number): string {
  return `marker:f${count(fret, 'fret')}`;
}

/** `find-marker:f7`: tap the 7th-fret marker (name → position). */
export function findMarkerItemId(fret: number): string {
  return `find-marker:f${count(fret, 'fret')}`;
}

export function parseMarkerItemId(
  id: string,
): { kind: 'marker' | 'find-marker'; fret: number } | null {
  const m = MARKER_ITEM.exec(id);
  if (!m) return null;
  return { kind: m[1] as 'marker' | 'find-marker', fret: Number(m[2]) };
}

export default {
  kinds: ['marker', 'find-marker'],
  id: (ref) => (ref.kind === 'marker' ? markerItemId(ref.fret) : findMarkerItemId(ref.fret)),
  parse: parseMarkerItemId,
} satisfies ItemKind<ItemRefs['marker']>;
