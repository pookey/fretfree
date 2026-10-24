import { parseReadingPosition, staffNote, type ReadingPositionId } from '../../theory';
import type { ItemKind, ItemRefs } from '../model';

declare module '../model' {
  interface ItemRefs {
    'staff-fret': { kind: 'staff-fret'; note: string; position: ReadingPositionId };
  }
}

const STAFF_FRET_ITEM = /^staff→fret:([A-G](?:#{1,2}|b{1,2})?-?\d)@(open|pos[1-9]\d*)$/;

/**
 * `staff→fret:G3@pos5`: read the note on the staff and tap where it is played
 * in 5th position (R2, D23). The note is the **sounding** pitch, as
 * `theory/staff.ts` and the fretboard name it (G3 is the open 3rd string), and
 * the position is a reading position: `open` or `pos<fret>`, the fret the
 * index finger covers. In a position each pitch has one fret (design §12), so
 * the card has one answer. Each position is its own card for the same pitch:
 * reading G3 in open position and in 5th position are different places.
 */
export function staffFretItemId(note: string, position: ReadingPositionId): string {
  if (canonicalNote(note) !== note) throw new RangeError(`Invalid staff note: ${note}`);
  if (!validPosition(position)) throw new RangeError(`Invalid reading position: ${position}`);
  return `staff→fret:${note}@${position}`;
}

export function parseStaffFretItemId(
  id: string,
): { note: string; position: ReadingPositionId } | null {
  const m = STAFF_FRET_ITEM.exec(id);
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
  kinds: ['staff-fret'],
  id: (ref) => staffFretItemId(ref.note, ref.position),
  parse(id) {
    const ref = parseStaffFretItemId(id);
    return ref && { kind: 'staff-fret', ...ref };
  },
} satisfies ItemKind<ItemRefs['staff-fret']>;
