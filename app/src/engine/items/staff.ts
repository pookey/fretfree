import { staffNote, staffPositions, type Clef } from '../../theory';
import type { ItemKind, ItemRefs } from '../model';

/** Which way a staff card asks: read the note's name, or place the named note. */
export type StaffDirection = 'read' | 'place';

export const STAFF_DIRECTIONS: readonly StaffDirection[] = ['read', 'place'];

declare module '../model' {
  interface ItemRefs {
    staff: { kind: 'staff'; note: string; clef: Clef; direction: StaffDirection };
  }
}

const STAFF_ITEM = /^staff:([A-G](?:#{1,2}|b{1,2})?-?\d)@(treble8vb|treble)(:place)?$/;

/**
 * `staff:E4@treble8vb`: the note on the staff, named (R1, staff → name).
 * `staff:E4@treble8vb:place`: the other direction, the named note placed on
 * the staff (name → staff). Each direction is its own card (research/02
 * rule 1).
 *
 * The note is the **sounding** pitch, as `theory/staff.ts` and the
 * fretboard name it: `E4` is the open 1st string, written in the top space
 * of a treble 8vb staff (as E5), not on the bottom line. Every R item keeps
 * this, so the staff cards and the fretboard cards about one pitch never
 * drift an octave apart.
 */
export function staffItemId(
  note: string,
  clef: Clef = 'treble8vb',
  direction: StaffDirection = 'read',
): string {
  const canonical = canonicalNote(note);
  if (canonical !== note) throw new RangeError(`Invalid staff note: ${note}`);
  return `staff:${note}@${clef}${direction === 'place' ? ':place' : ''}`;
}

export function parseStaffItemId(
  id: string,
): { note: string; clef: Clef; direction: StaffDirection } | null {
  const m = STAFF_ITEM.exec(id);
  if (!m || canonicalNote(m[1] as string) !== m[1]) return null;
  return {
    note: m[1] as string,
    clef: m[2] as Clef,
    direction: m[3] ? 'place' : 'read',
  };
}

/** The note as `staffNote` spells it, or null if it isn't a note with an octave. */
function canonicalNote(note: string): string | null {
  try {
    return staffNote(note).name;
  } catch {
    return null;
  }
}

/**
 * The confusion-matrix concept of a staff place: `staff@7` is the top space.
 * A place, not a pitch, so both directions and every clef share it: the
 * error being paired is a line read as the space next to it.
 */
export function staffConcept(position: number): string {
  return `staff@${position}`;
}

/**
 * Seed confusions (design §12 "interleave confusables"): each line with the
 * spaces either side, across R1's range of ±3 ledger lines.
 */
export const STAFF_NEIGHBOUR_CONFUSIONS: readonly (readonly [string, string])[] = staffPositions(3)
  .slice(1)
  .map((p) => [staffConcept(p - 1), staffConcept(p)] as const);

export default {
  kinds: ['staff'],
  id: (ref) => staffItemId(ref.note, ref.clef, ref.direction),
  parse(id) {
    const ref = parseStaffItemId(id);
    return ref && { kind: 'staff', ...ref };
  },
} satisfies ItemKind<ItemRefs['staff']>;
