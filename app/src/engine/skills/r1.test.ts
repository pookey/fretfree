import { describe, expect, it } from 'vitest';
import { staffPositions } from '../../theory';
import { parseStaffItemId } from '../items/staff';
import { R1_POSITIONS, skills } from './r1';
import { getSkill } from './index';

const ids = (skillId: string) =>
  getSkill(skillId)!
    .items()
    .map((i) => i.id);

describe('R1 skills', () => {
  it('reads every natural place within three ledger lines, each once', () => {
    const all = Object.values(R1_POSITIONS).flat();
    expect([...all].sort((a, b) => a - b)).toEqual(staffPositions(3));
  });

  it('asks each place both ways, in sounding pitch', () => {
    const staff = ids('R1.staff');
    expect(staff).toHaveLength(22);
    // The G line first: sounding G3, written on line 2.
    expect(staff.slice(0, 2)).toEqual(['staff:G3@treble8vb', 'staff:G3@treble8vb:place']);
    // E4, the open 1st string, sits in the top space, not on the bottom line (E3).
    expect(staff).toContain('staff:E4@treble8vb');
    expect(staff).toContain('staff:E3@treble8vb:place');
    for (const id of staff) expect(parseStaffItemId(id)?.clef).toBe('treble8vb');
  });

  it('opens the ledger lines below on open low E, and reaches F above the third line up', () => {
    expect(ids('R1.ledger-below')[0]).toBe('staff:E2@treble8vb');
    expect(ids('R1.ledger-below')).toHaveLength(12);
    expect(ids('R1.ledger-above')).toContain('staff:F5@treble8vb:place');
    expect(ids('R1.ledger-above')).toHaveLength(12);
  });

  it('opens after strings 6 and 5 and time signatures, one set at a time', () => {
    expect(skills.map((s) => [s.id, s.prerequisites])).toEqual([
      ['R1.staff', ['F2.string6-naturals', 'F2.string5-naturals', 'T1.simple-meters']],
      ['R1.ledger-below', ['R1.staff']],
      ['R1.ledger-above', ['R1.ledger-below']],
    ]);
    for (const s of skills) {
      expect(s.softUnlock).toBe(true);
      expect(s.drillTypes).toEqual(['staff-name']);
    }
  });
});
