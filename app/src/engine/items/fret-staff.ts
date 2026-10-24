import { parseReadingPosition, staffNote, type ReadingPositionId } from '../../theory';
import type { ItemKind, ItemRefs } from '../model';

declare module '../model' {
  interface ItemRefs {
    'fret-staff': { kind: 'fret-staff'; note: string; position: ReadingPositionId };
  }
}

const FRET_STAFF_ITEM = /^fret→staff:([A-G](?:#{1,2}|b{1,2})?-?\d)@(open|pos[1-9]\d*)$/;

/**
 * `fret→staff:G3@pos5`: a fret lit in 5th position, placed on the staff (R2,
 * D24). The other direction of `staff→fret:G3@pos5` (research/02 rule 1):
 * each is its own card. The note is the **sounding** pitch, as everywhere in
 * R, and the card is keyed by pitch within the position, not by cell: where
 * the position's frets play a pitch twice (9th position's two stretches),
 * both cells are the same card.
 */
export function fretStaffItemId(note: string, position: ReadingPositionId): string {
  if (canonicalNote(note) !== note) throw new RangeError(`Invalid staff note: ${note}`);
  if (!validPosition(position)) throw new RangeError(`Invalid reading position: ${position}`);
  return `fret→staff:${note}@${position}`;
}

export function parseFretStaffItemId(
  id: string,
): { note: string; position: ReadingPositionId } | null {
  const m = FRET_STAFF_ITEM.exec(id);
  if (!m) return null;
  const note = m[1] as string;
  const position = m[2] as ReadingPositionId;
  if (canonicalNote(note) !== note || !validPosition(position)) return null;
  return { note, position };
}

/** The note as `staffNote` spells it, or null if it isn't a note with an octave. */
function canonicalNote(note: string): string | null {
  try {
    return staffNote(note).name;
  } catch {
    return null;
  }
}

function validPosition(id: string): boolean {
  try {
    parseReadingPosition(id);
    return true;
  } catch {
    return false;
  }
}

export default {
  kinds: ['fret-staff'],
  id: (ref) => fretStaffItemId(ref.note, ref.position),
  parse(id) {
    const ref = parseFretStaffItemId(id);
    return ref && { kind: 'fret-staff', ...ref };
  },
} satisfies ItemKind<ItemRefs['fret-staff']>;
