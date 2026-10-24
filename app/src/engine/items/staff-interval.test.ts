import { describe, expect, it } from 'vitest';
import { itemId, parseItemId } from '../model';
import {
  STAFF_INTERVAL_CONFUSIONS,
  parseStaffIntervalItemId,
  staffIntervalConcept,
  staffIntervalItemId,
} from './staff-interval';

describe('staff interval item IDs', () => {
  it('formats and parses a signed interval in each direction', () => {
    expect(staffIntervalItemId(3)).toBe('staff-interval:+3@treble8vb');
    expect(staffIntervalItemId(-2, 'treble8vb', 'place')).toBe('staff-interval:-2@treble8vb:place');
    expect(parseStaffIntervalItemId('staff-interval:+8@treble8vb')).toEqual({
      steps: 8,
      clef: 'treble8vb',
      direction: 'read',
    });
    expect(parseItemId('staff-interval:-5@treble8vb:place')).toEqual({
      kind: 'staff-interval',
      steps: -5,
      clef: 'treble8vb',
      direction: 'place',
    });
    for (const id of ['staff-interval:+2@treble', 'staff-interval:-7@treble8vb:place']) {
      expect(itemId(parseItemId(id)!)).toBe(id);
    }
  });

  it('refuses unisons, intervals past an octave and anything not canonical', () => {
    for (const n of [0, 1, -1, 9, -9, 2.5]) {
      expect(() => staffIntervalItemId(n), String(n)).toThrow(RangeError);
    }
    for (const id of [
      'staff-interval:3@treble8vb',
      'staff-interval:+1@treble8vb',
      'staff-interval:+9@treble8vb',
      'staff-interval:+3@bass',
      'staff-interval:+3@treble8vb:read',
      'staff-interval:+03@treble8vb',
      'staff:E4@treble8vb',
    ]) {
      expect(parseStaffIntervalItemId(id), id).toBeNull();
    }
    // The staff note family doesn't claim interval IDs, nor this one notes.
    expect(parseItemId('staff:E4@treble8vb')?.kind).toBe('staff');
  });

  it('keys confusions by size, and seeds each with the next one up', () => {
    expect(staffIntervalConcept(-3)).toBe('staff-interval:3');
    expect(staffIntervalConcept(3)).toBe('staff-interval:3');
    expect(STAFF_INTERVAL_CONFUSIONS).toEqual([
      ['staff-interval:2', 'staff-interval:3'],
      ['staff-interval:3', 'staff-interval:4'],
      ['staff-interval:4', 'staff-interval:5'],
      ['staff-interval:5', 'staff-interval:6'],
      ['staff-interval:6', 'staff-interval:7'],
      ['staff-interval:7', 'staff-interval:8'],
    ]);
  });
});
