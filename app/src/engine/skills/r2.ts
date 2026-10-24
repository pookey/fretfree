import {
  READING_POSITIONS,
  STANDARD_TUNING,
  ledgerLineCount,
  positionMap,
  spellMidi,
  staffPosition,
  type Position,
  type ReadingPosition,
  type Tuning,
} from '../../theory';
import { ENGINE_CONFIG } from '../config';
import { fretStaffItemId } from '../items/fret-staff';
import { staffFretItemId } from '../items/staff-fret';
import type { Skill } from '../model';
import { itemsOf, memo } from './helpers';

/**
 * R2: staff → fretboard by position (research/03 track R, design §12,
 * Leavitt-style position reading). An item such as `staff→fret:G3@pos5`
 * shows G3 on the staff and asks where it is played in 5th position; D23
 * takes the tap. Its reverse, `fret→staff:G3@pos5`, lights the fret and asks
 * for the note's place on the staff (D24). Each position is its own skill, in research/03's order:
 * open position, then the 5th, 7th, 9th and 12th. Each soft-unlocks the
 * next once it is practising, so a new position's notes are blocked briefly
 * and then interleave with the positions already met (research/02 rule 6),
 * and the same pitch read in several positions varies the context (rule 12).
 *
 * **Notes are sounding pitches** (as in R1 and `theory/staff.ts`): G3 is the
 * open 3rd string, written on the 2nd line of the treble 8vb staff.
 *
 * Which notes: the naturals each position plays, as R1 reads them, within
 * ±3 ledger lines (R1's range), so the 12th position's high G5 waits for
 * notation past that. Accidentals and key signatures are R3's.
 *
 * Which fret: `positionMap` with the default stretch, the index finger
 * reaching back a fret and the little finger reaching up one when it can't.
 * Only two positions need a stretch for a natural: 5th position reaches back
 * to fret 4 for B3, and 9th position back to fret 8 (C3, F3, C5) and up to
 * fret 13 (F5). Open position stays on frets 0–3, as research/03 has it, and
 * the 7th and 12th on their four frets. Every pitch has exactly one fret
 * (`isPositionFret`), the one D23's feedback names. 9th position's two
 * stretches give F3, G4 and C5 a second cell in reach, which D23 also
 * accepts.
 *
 * Order within a position: the notes on the staff first, the ledger lines
 * after, nearest the staff first, as R1 introduces them; low to high within
 * each. Reading a note in position builds on reading it (R1): open position
 * opens once R1's ledger lines below the staff are practising, since it reads
 * down to open low E, and 5th position also waits on the ledger lines above,
 * which it reads up to C5. Reading is an optional track, so R2 stays out of
 * the placement test.
 */

export const R2_DRILLS = ['staff-to-fret', 'fret-to-staff'];

/** R1's range: notes R2 reads stay within this many ledger lines. */
export const R2_MAX_LEDGERS = 3;

/** A note R2 reads in a position: its sounding name, staff place and one fret. */
export interface PositionNote {
  readonly note: string;
  readonly midi: number;
  readonly staff: number;
  readonly at: Position;
}

const NATURAL_CHROMAS = new Set([0, 2, 4, 5, 7, 9, 11]);

/**
 * The natural notes a position plays within R2's ledger lines, in the order
 * the position's skill introduces them (see above).
 */
export function positionNaturals(
  position: ReadingPosition,
  tuning: Tuning = STANDARD_TUNING,
): PositionNote[] {
  return positionMap(position, { tuning })
    .filter(({ midi }) => NATURAL_CHROMAS.has(((midi % 12) + 12) % 12))
    .map(({ midi, at }) => {
      const note = spellMidi(midi);
      return { note, midi, staff: staffPosition(note), at };
    })
    .filter((n) => ledgerLineCount(n.staff) <= R2_MAX_LEDGERS)
    .sort((a, b) => ledgerLineCount(a.staff) - ledgerLineCount(b.staff) || a.midi - b.midi);
}

/**
 * A position's cards in the order they are introduced, both directions
 * (research/02 rule 1): `staff→fret` (D23) reads the staff onto the neck and
 * `fret→staff` (D24) places a lit fret on the staff. As R1 does, the reading
 * cards lead by one new-item block and each note's reverse card follows in
 * a later block, between new reading cards, so it is recalled rather than
 * copied from the worked example just before it (rules 4 and 6).
 */
export function r2ItemIds(
  position: ReadingPosition,
  lead: number = ENGINE_CONFIG.session.newBlockSize,
  tuning: Tuning = STANDARD_TUNING,
): string[] {
  const notes = positionNaturals(position, tuning).map((n) => n.note);
  const out = notes.slice(0, lead).map((n) => staffFretItemId(n, position.id));
  notes.forEach((n, i) => {
    out.push(fretStaffItemId(n, position.id));
    const next = notes[lead + i];
    if (next !== undefined) out.push(staffFretItemId(next, position.id));
  });
  return out;
}

/** Skill IDs by position, in teaching order. IDs are literals, which e2e seeds read from this file. */
const POSITION_SKILLS = [
  { id: 'R2.open', title: 'Read the staff in open position', reads: ['R1.ledger-below'] },
  { id: 'R2.pos5', title: 'Read the staff in 5th position', reads: ['R1.ledger-above'] },
  { id: 'R2.pos7', title: 'Read the staff in 7th position' },
  { id: 'R2.pos9', title: 'Read the staff in 9th position' },
  { id: 'R2.pos12', title: 'Read the staff in 12th position' },
] as const;

export const skills: Skill[] = POSITION_SKILLS.map((s, i): Skill => {
  const { id, title } = s;
  // The R1 skill that reads the new ledger lines a position needs, if any.
  const reads: readonly string[] = 'reads' in s ? s.reads : [];
  const position = READING_POSITIONS[i] as ReadingPosition;
  const prev = POSITION_SKILLS[i - 1];
  return {
    id,
    topic: 'R2',
    order: 3000 + i * 10,
    title,
    prerequisites: [...(prev ? [prev.id] : []), ...reads],
    softUnlock: true,
    skipPlacement: true,
    drillTypes: R2_DRILLS,
    items: memo(() => itemsOf(id, r2ItemIds(position))),
  };
});
