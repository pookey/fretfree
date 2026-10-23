import { describe, expect, it } from 'vitest';
import { itemId, parseItemId } from '../model';
import meter, { METER_FACTS, meterItemId, parseMeterItemId } from './meter';

describe('meter items', () => {
  it('builds and parses `meter:<top>/<bottom>:<fact>`', () => {
    expect(meterItemId('6/8', 'feltBeats')).toBe('meter:6/8:feltBeats');
    expect(meterItemId('2/2', 'kind')).toBe('meter:2/2:kind');
    expect(parseMeterItemId('meter:12/8:fromBeats')).toEqual({ meter: '12/8', fact: 'fromBeats' });
    for (const fact of METER_FACTS)
      expect(parseMeterItemId(meterItemId('3/4', fact))).toEqual({ meter: '3/4', fact });
  });

  it('rejects malformed IDs and meters theory does not accept', () => {
    expect(parseMeterItemId('meter:6/8')).toBeNull();
    expect(parseMeterItemId('meter:6/8:beats')).toBeNull();
    expect(parseMeterItemId('meter:06/8:kind')).toBeNull();
    expect(parseMeterItemId('meter:4/3:kind')).toBeNull();
    expect(parseMeterItemId('meter:7/8 (2+2+3):kind')).toBeNull();
    expect(parseMeterItemId('meter-ear:3/4')).toBeNull();
    expect(() => meterItemId('4/3', 'kind')).toThrow(RangeError);
    expect(() => meterItemId('C', 'kind')).toThrow(RangeError);
    expect(() => meterItemId('7/8 (3+2+2)', 'kind')).toThrow(RangeError);
  });

  it('round-trips through the item registry', () => {
    expect(meter.kinds).toEqual(['meter']);
    const ref = parseItemId('meter:6/8:feltBeats');
    expect(ref).toEqual({ kind: 'meter', meter: '6/8', fact: 'feltBeats' });
    expect(itemId(ref!)).toBe('meter:6/8:feltBeats');
  });
});
