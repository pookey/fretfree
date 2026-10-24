import { describe, expect, it } from 'vitest';
import { itemId, parseItemId } from '../model';
import fretStaff, { fretStaffItemId, parseFretStaffItemId } from './fret-staff';

describe('fret → staff items', () => {
  it('builds and parses `fret→staff:<note>@<position>`', () => {
    expect(fretStaffItemId('G3', 'pos5')).toBe('fret→staff:G3@pos5');
    expect(fretStaffItemId('E2', 'open')).toBe('fret→staff:E2@open');
    expect(fretStaffItemId('F#4', 'pos12')).toBe('fret→staff:F#4@pos12');
    expect(parseFretStaffItemId('fret→staff:G3@pos5')).toEqual({ note: 'G3', position: 'pos5' });
    expect(parseFretStaffItemId('fret→staff:Bb2@open')).toEqual({ note: 'Bb2', position: 'open' });
  });

  it('rejects malformed IDs and arguments', () => {
    for (const id of [
      'fret→staff:G3',
      'fret→staff:G3@pos05',
      'fret→staff:G3@pos0',
      'fret→staff:G3@pos22',
      'fret→staff:H3@pos5',
      'fret→staff:g3@pos5',
      'fret→staff:G@pos5',
      'fret->staff:G3@pos5',
      'staff→fret:G3@pos5',
    ]) {
      expect(parseFretStaffItemId(id), id).toBeNull();
    }
    expect(() => fretStaffItemId('G', 'pos5')).toThrow(RangeError);
    expect(() => fretStaffItemId('g3', 'pos5')).toThrow(RangeError);
    expect(() => fretStaffItemId('G3', 'pos0')).toThrow(RangeError);
    expect(() => fretStaffItemId('G3', 'pos22')).toThrow(RangeError);
  });

  it('round-trips through the item registry', () => {
    const ref = parseItemId('fret→staff:C4@pos7');
    expect(ref).toEqual({ kind: 'fret-staff', note: 'C4', position: 'pos7' });
    expect(itemId(ref!)).toBe('fret→staff:C4@pos7');
    expect(fretStaff.kinds).toEqual(['fret-staff']);
  });
});
