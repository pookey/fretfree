import type { Position } from '../../theory';
import type { ItemKind, ItemRefs } from '../model';
import { count, INT } from './helpers';

declare module '../model' {
  interface ItemRefs {
    tab: { kind: 'tab'; position: Position };
  }
}

const TAB_ITEM = new RegExp(`^tab@s${INT}f${INT}$`);

/**
 * `tab@s3f5`: read the note on tab line 3 at fret 5 and tap that cell on the
 * neck (D33, tab → neck). Its own card, apart from `note@s3f5` (naming the
 * note there): reading tab is knowing where, not what (docs/design/tab-track.md §4).
 */
export function tabItemId(pos: Position): string {
  return `tab@s${count(pos.string, 'string')}f${count(pos.fret, 'fret')}`;
}

export function parseTabItemId(id: string): Position | null {
  const m = TAB_ITEM.exec(id);
  if (!m) return null;
  return { string: Number(m[1]), fret: Number(m[2]) };
}

export default {
  kinds: ['tab'],
  id: (ref) => tabItemId(ref.position),
  parse(id) {
    const position = parseTabItemId(id);
    return position && { kind: 'tab', position };
  },
} satisfies ItemKind<ItemRefs['tab']>;
