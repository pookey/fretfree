import type { Position } from '../../theory';
import type { ItemKind, ItemRefs } from '../model';
import { count, INT } from './helpers';

declare module '../model' {
  interface ItemRefs {
    octave: { kind: 'octave'; from: Position; string: number };
  }
}

const OCTAVE_ITEM = new RegExp(`^octave:s${INT}f${INT}→s${INT}$`);

/** `octave:s6f5→s4`: the octave of string 6, fret 5 on string 4. */
export function octaveItemId(from: Position, string: number): string {
  return `octave:s${count(from.string, 'string')}f${count(from.fret, 'fret')}→s${count(string, 'string')}`;
}

export function parseOctaveItemId(id: string): { from: Position; string: number } | null {
  const m = OCTAVE_ITEM.exec(id);
  if (!m) return null;
  return { from: { string: Number(m[1]), fret: Number(m[2]) }, string: Number(m[3]) };
}

export default {
  kinds: ['octave'],
  id: (ref) => octaveItemId(ref.from, ref.string),
  parse(id) {
    const octave = parseOctaveItemId(id);
    return octave && { kind: 'octave', ...octave };
  },
} satisfies ItemKind<ItemRefs['octave']>;
