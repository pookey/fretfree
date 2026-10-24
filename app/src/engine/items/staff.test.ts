import { describe, expect, it } from 'vitest';
import { itemId, parseItemId } from '../model';
import { STAFF_NEIGHBOUR_CONFUSIONS, parseStaffItemId, staffConcept, staffItemId } from './staff';

describe('staff item IDs', () => {
  it('formats and parses a sounding note in each direction', () => {
    expect(staffItemId('E4')).toBe('staff:E4@treble8vb');
    expect(staffItemId('E4', 'treble8vb', 'place')).toBe('staff:E4@treble8vb:place');
    expect(parseStaffItemId('staff:E4@treble8vb')).toEqual({
      note: 'E4',
      clef: 'treble8vb',
      direction: 'read',
    });
    expect(parseItemId('staff:E2@treble8vb:place')).toEqual({
      kind: 'staff',
      note: 'E2',
      clef: 'treble8vb',
      direction: 'place',
    });
    for (const id of ['staff:F#3@treble8vb', 'staff:Bb2@treble:place', 'staff:C4@treble']) {
      expect(itemId(parseItemId(id)!)).toBe(id);
    }
  });

  it('refuses what would not parse', () => {
    expect(() => staffItemId('E')).toThrow(RangeError);
    expect(() => staffItemId('e4')).toThrow(RangeError);
    expect(() => staffItemId('H4')).toThrow(RangeError);
    for (const id of [
      'staff:E4',
      'staff:E@treble8vb',
      'staff:e4@treble8vb',
      'staff:E4@bass',
      'staff:E4@treble8vb:read',
      'staff:Ebbb4@treble8vb',
      'note@s1f0',
    ]) {
      expect(parseStaffItemId(id), id).toBeNull();
    }
  });

  it('keys confusions by place, pairing each line with the spaces beside it', () => {
    expect(staffConcept(-7)).toBe('staff@-7');
    expect(STAFF_NEIGHBOUR_CONFUSIONS).toHaveLength(22);
    expect(STAFF_NEIGHBOUR_CONFUSIONS[0]).toEqual(['staff@-7', 'staff@-6']);
    expect(STAFF_NEIGHBOUR_CONFUSIONS.at(-1)).toEqual(['staff@14', 'staff@15']);
    expect(STAFF_NEIGHBOUR_CONFUSIONS).toContainEqual(['staff@6', 'staff@7']);
  });
});
