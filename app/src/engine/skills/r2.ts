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
import { staffFretItemId } from '../items/staff-fret';
import type { Skill } from '../model';
import { itemsOf, memo } from './helpers';

/**
 * R2: staff → fretboard by position (research/03 track R, design §12,
 * Leavitt-style position reading). An item such as `staff→fret:G3@pos5`
 * shows G3 on the staff and asks where it is played in 5th position; D23
 * takes the tap. Each position is its own skill, in research/03's order:
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
 * the 7th and 12th on their four frets. Every pitch has exactly one fret, so
 * a tap has one right answer (`isPositionFret`).
 *
 * Order within a position: the notes on the staff first, the ledger lines
 * after, nearest the staff first, as R1 introduces them; low to high within
 * each. Reading builds on the natural notes of strings 6 and 5 and on time
 * signatures, as R1 does (design §5 M-Reading). Reading is an optional track,
 * so R2 stays out of the placement test.
 */

export const R2_DRILLS = ['staff-to-fret'];

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

/** Skill IDs by position, in teaching order. IDs are literals, which e2e seeds read from this file. */
const POSITION_SKILLS = [
  { id: 'R2.open', title: 'Read the staff in open position' },
  { id: 'R2.pos5', title: 'Read the staff in 5th position' },
  { id: 'R2.pos7', title: 'Read the staff in 7th position' },
  { id: 'R2.pos9', title: 'Read the staff in 9th position' },
  { id: 'R2.pos12', title: 'Read the staff in 12th position' },
] as const;

/** The reading-track gates R1 opens with (design §5 M-Reading). */
const READING_GATES = ['F2.string6-naturals', 'F2.string5-naturals', 'T1.simple-meters'];

export const skills: Skill[] = POSITION_SKILLS.map(({ id, title }, i): Skill => {
  const position = READING_POSITIONS[i] as ReadingPosition;
  const prev = POSITION_SKILLS[i - 1];
  return {
    id,
    topic: 'R2',
    order: 3000 + i * 10,
    title,
    prerequisites: prev ? [prev.id] : READING_GATES,
    softUnlock: true,
    skipPlacement: true,
    drillTypes: R2_DRILLS,
    items: memo(() =>
      itemsOf(
        id,
        positionNaturals(position).map((n) => staffFretItemId(n.note, position.id)),
      ),
    ),
  };
});
