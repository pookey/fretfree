import { describe, expect, it } from 'vitest';
import { itemId, parseItemId } from '../model';
import staffFret, { parseStaffFretItemId, staffFretItemId } from './staff-fret';

describe('staff → fret items', () => {
  it('builds and parses `staff→fret:<note>@<position>`', () => {
    expect(staffFretItemId('G3', 'pos5')).toBe('staff→fret:G3@pos5');
    expect(staffFretItemId('E2', 'open')).toBe('staff→fret:E2@open');
    expect(staffFretItemId('F#4', 'pos12')).toBe('staff→fret:F#4@pos12');
    expect(parseStaffFretItemId('staff→fret:G3@pos5')).toEqual({ note: 'G3', position: 'pos5' });
    expect(parseStaffFretItemId('staff→fret:Bb2@open')).toEqual({ note: 'Bb2', position: 'open' });
  });

  it('rejects malformed IDs and arguments', () => {
    for (const id of [
      'staff→fret:G3',
      'staff→fret:G3@pos05',
      'staff→fret:G3@pos0',
      'staff→fret:G3@pos22',
      'staff→fret:H3@pos5',
      'staff→fret:g3@pos5',
      'staff→fret:G@pos5',
      'staff->fret:G3@pos5',
      'staff:G3@treble8vb',
    ]) {
      expect(parseStaffFretItemId(id), id).toBeNull();
    }
    expect(() => staffFretItemId('G', 'pos5')).toThrow(RangeError);
    expect(() => staffFretItemId('g3', 'pos5')).toThrow(RangeError);
    expect(() => staffFretItemId('G3', 'pos0')).toThrow(RangeError);
    expect(() => staffFretItemId('G3', 'pos22')).toThrow(RangeError);
  });

  it('round-trips through the item registry', () => {
    const ref = parseItemId('staff→fret:C4@pos7');
    expect(ref).toEqual({ kind: 'staff-fret', note: 'C4', position: 'pos7' });
    expect(itemId(ref!)).toBe('staff→fret:C4@pos7');
    expect(staffFret.kinds).toEqual(['staff-fret']);
  });
});
