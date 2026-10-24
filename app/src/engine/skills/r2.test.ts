import { describe, expect, it } from 'vitest';
import {
  READING_POSITIONS,
  isPositionFret,
  ledgerLineCount,
  readingPosition,
  type ReadingPosition,
} from '../../theory';
import { ENGINE_CONFIG } from '../config';
import { parseFretStaffItemId } from '../items/fret-staff';
import { parseStaffFretItemId } from '../items/staff-fret';
import { getSkill } from './index';
import { R2_DRILLS, R2_MAX_LEDGERS, positionNaturals, r2ItemIds, skills } from './r2';

const allIds = (skillId: string) =>
  getSkill(skillId)!
    .items()
    .map((i) => i.id);

/** The staff → fret cards (D23), in order. */
const ids = (skillId: string) => allIds(skillId).filter((id) => id.startsWith('staff→fret:'));

const naturals = (fret: number) => positionNaturals(readingPosition(fret));

describe('R2 skills', () => {
  it('teaches open position first, then the 5th, 7th, 9th and 12th', () => {
    expect(skills.map((s) => s.id)).toEqual([
      'R2.open',
      'R2.pos5',
      'R2.pos7',
      'R2.pos9',
      'R2.pos12',
    ]);
    expect(skills.map((s) => s.prerequisites)).toEqual([
      ['R1.ledger-below'],
      ['R2.open', 'R1.ledger-above'],
      ['R2.pos5'],
      ['R2.pos7'],
      ['R2.pos9'],
    ]);
    for (const s of skills) {
      expect(s.topic).toBe('R2');
      expect(s.softUnlock).toBe(true);
      expect(s.skipPlacement).toBe(true);
      expect(s.drillTypes).toEqual(R2_DRILLS);
    }
  });

  it('names items `staff→fret:<note>@<position>`, each skill in its own position', () => {
    expect(ids('R2.pos5')).toContain('staff→fret:G3@pos5');
    expect(ids('R2.open')).toContain('staff→fret:E2@open');
    skills.forEach((s, i) => {
      const position = READING_POSITIONS[i] as ReadingPosition;
      for (const id of ids(s.id)) expect(parseStaffFretItemId(id)?.position).toBe(position.id);
    });
  });

  it('has a fret → staff card (D24) for every note, each a block after its reading card', () => {
    const lead = ENGINE_CONFIG.session.newBlockSize;
    for (const s of skills) {
      const all = allIds(s.id);
      const reverse = all.filter((id) => id.startsWith('fret→staff:'));
      expect(reverse.map((id) => parseFretStaffItemId(id)?.note)).toEqual(
        ids(s.id).map((id) => parseStaffFretItemId(id)?.note),
      );
      expect(all).toHaveLength(2 * reverse.length);
      for (const id of reverse) {
        const ref = parseFretStaffItemId(id)!;
        const forward = all.indexOf(`staff→fret:${ref.note}@${ref.position}`);
        expect(all.indexOf(id) - forward, id).toBeGreaterThanOrEqual(lead);
      }
    }
    expect(r2ItemIds(READING_POSITIONS[1]!, 2).slice(0, 4)).toEqual([
      'staff→fret:D3@pos5',
      'staff→fret:E3@pos5',
      'fret→staff:D3@pos5',
      'staff→fret:F3@pos5',
    ]);
  });

  it('reads open position on frets 0–3, the staff first, then the ledger lines below', () => {
    expect(ids('R2.open')).toEqual(
      [
        'D3',
        'E3',
        'F3',
        'G3',
        'A3',
        'B3',
        'C4',
        'D4',
        'E4',
        'F4',
        'G4',
        'B2',
        'C3',
        'G2',
        'A2',
        'E2',
        'F2',
      ].map((n) => `staff→fret:${n}@open`),
    );
    expect(Math.max(...naturals(0).map((n) => n.at.fret))).toBe(3);
  });

  it('gives every note one fret in its position, within R1’s ledger lines', () => {
    for (const position of READING_POSITIONS) {
      const notes = positionNaturals(position);
      expect(new Set(notes.map((n) => n.note)).size).toBe(notes.length);
      for (const n of notes) {
        expect(isPositionFret(n.at, position), `${n.note}@${position.id}`).toBe(true);
        expect(ledgerLineCount(n.staff)).toBeLessThanOrEqual(R2_MAX_LEDGERS);
        expect(n.note).toMatch(/^[A-G]\d$/);
      }
    }
    // The 12th position's G5 needs a 4th ledger line, past R1.
    expect(naturals(12).map((n) => n.note)).not.toContain('G5');
  });

  it('stretches only where a natural needs it: 5th position back to fret 4, 9th to 8 and 13', () => {
    const frets = (fret: number) => [...new Set(naturals(fret).map((n) => n.at.fret))].sort();
    expect(naturals(5).find((n) => n.note === 'B3')?.at).toEqual({ string: 3, fret: 4 });
    expect(Math.min(...naturals(5).map((n) => n.at.fret))).toBe(4);
    expect(Math.min(...naturals(9).map((n) => n.at.fret))).toBe(8);
    expect(Math.max(...naturals(9).map((n) => n.at.fret))).toBe(13);
    expect(frets(7).every((f) => f >= 7 && f <= 10)).toBe(true);
    expect(frets(12).every((f) => f >= 12 && f <= 15)).toBe(true);
  });
});
