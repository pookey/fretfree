import type { Position } from '../../theory';
import type { ItemKind, ItemRefs } from '../model';
import { count, INT } from './helpers';

declare module '../model' {
  interface ItemRefs {
    note: { kind: 'note'; position: Position };
  }
}

const NOTE_ITEM = new RegExp(`^note@s${INT}f${INT}$`);

/** `note@s6f5`: name the note at string 6, fret 5 (position → name). */
export function noteItemId(pos: Position): string {
  return `note@s${count(pos.string, 'string')}f${count(pos.fret, 'fret')}`;
}

export function parseNoteItemId(id: string): Position | null {
  const m = NOTE_ITEM.exec(id);
  if (!m) return null;
  return { string: Number(m[1]), fret: Number(m[2]) };
}

export default {
  kinds: ['note'],
  id: (ref) => noteItemId(ref.position),
  parse(id) {
    const position = parseNoteItemId(id);
    return position && { kind: 'note', position };
  },
} satisfies ItemKind<ItemRefs['note']>;
