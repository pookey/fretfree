import { noteAtStaffPosition } from '../../theory';
import { ENGINE_CONFIG } from '../config';
import { staffItemId } from '../items/staff';
import type { Skill } from '../model';
import { itemsOf, memo } from './helpers';

/**
 * R1: staff basics (research/03 track R, design §12): name any natural note
 * on the guitar's treble clef 8vb in under 2 s, ±3 ledger lines included.
 * Each staff place has a card per direction (research/02 rule 1):
 *
 * - `staff:E4@treble8vb`: the note on the staff, named A–G (staff → name);
 * - `staff:E4@treble8vb:place`: the named note, tapped on the staff
 *   (name → staff).
 *
 * **Notes are sounding pitches**, as on the fretboard and in
 * `theory/staff.ts`: `E4` is the open 1st string, written in the top space
 * (as E5), and `E2`, the open low E, hangs under three ledger lines. Every R
 * item keeps this, so a staff card and a fretboard card about one pitch never
 * drift an octave apart.
 *
 * The staff comes first, then the ledger lines below it (the low strings,
 * which a guitarist reads most), then above. Each set opens with its anchors
 * (the G line the clef curls round, open low E, the first ledger line above)
 * and soft-unlocks the next once it is practising, so new places are blocked
 * briefly and then interleave with those already met (rule 6). D22 keys
 * every card by its place and the session builder seeds each line with the
 * spaces beside it (`engine/confusions.ts`), so neighbours meet in a session.
 *
 * Speed: the usual personal target applies (rule 3: baseline + 2 s), which
 * is research/03's "under 2 s" of reading on top of the learner's tap time.
 *
 * Reading is an optional track (design §12): previewable for everyone, and
 * opened by the natural notes on strings 6 and 5 and time signatures (design
 * §5 M-Reading), once those are practising. R1 isn't a placement topic.
 */

export const R1_DRILLS = ['staff-name'];

/**
 * Staff positions (0 = bottom line, odd = spaces) in the order each set
 * introduces them, anchors first. IDs are literals, which e2e seeds read
 * from this file.
 */
const SETS = [
  {
    id: 'R1.staff',
    title: 'Read the staff: lines and spaces',
    prerequisites: ['F2.string6-naturals', 'F2.string5-naturals', 'T1.simple-meters'],
    positions: [2, 0, 4, 6, 8, 1, 3, 5, 7, -1, 9],
  },
  {
    id: 'R1.ledger-below',
    title: 'Ledger lines below the staff: the low strings',
    prerequisites: ['R1.staff'],
    positions: [-7, -2, -4, -6, -3, -5],
  },
  {
    id: 'R1.ledger-above',
    title: 'Ledger lines above the staff',
    prerequisites: ['R1.ledger-below'],
    positions: [10, 12, 14, 11, 13, 15],
  },
] as const;

/** Every staff position R1 reads, by skill. */
export const R1_POSITIONS: Readonly<Record<string, readonly number[]>> = Object.fromEntries(
  SETS.map((s) => [s.id, s.positions]),
);

/**
 * A set's cards in the order they are introduced: its reading cards lead by
 * one new-item block, and each place's placing card follows in a later
 * block, between new reading cards. The placing card for G never comes
 * straight after the worked example that showed where G is, so it is
 * recalled, not copied (research/02 rules 4 and 6), and every session that
 * introduces cards still meets both directions.
 */
export function r1ItemIds(
  positions: readonly number[],
  lead: number = ENGINE_CONFIG.session.newBlockSize,
): string[] {
  const id = (p: number, d: 'read' | 'place') =>
    staffItemId(noteAtStaffPosition(p), 'treble8vb', d);
  const out = positions.slice(0, lead).map((p) => id(p, 'read'));
  positions.forEach((p, i) => {
    out.push(id(p, 'place'));
    const next = positions[lead + i];
    if (next !== undefined) out.push(id(next, 'read'));
  });
  return out;
}

export const skills: Skill[] = SETS.map((s, i) => ({
  id: s.id,
  topic: 'R1',
  order: 2900 + i * 10,
  title: s.title,
  prerequisites: s.prerequisites,
  softUnlock: true,
  drillTypes: R1_DRILLS,
  items: memo(() => itemsOf(s.id, r1ItemIds(s.positions))),
}));
