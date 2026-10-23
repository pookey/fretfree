import { describe, expect, it } from 'vitest';
import { itemId, parseItemId } from '../model';
import meterEar, {
  EAR_METERS,
  METER_SETS_BY_BAR,
  METER_SETS_BY_KIND,
  isEarMeter,
  meterEarItemId,
  parseMeterEarItemId,
  type EarMeter,
} from './meter-ear';

describe('meter-ear items', () => {
  it('builds and parses `meter-ear:<meter>`', () => {
    expect(meterEarItemId('3/4')).toBe('meter-ear:3/4');
    expect(meterEarItemId('12/8')).toBe('meter-ear:12/8');
    expect(parseMeterEarItemId('meter-ear:6/8')).toEqual({ kind: 'meter-ear', meter: '6/8' });
  });

  it('round-trips every meter through the item registry', () => {
    for (const meter of EAR_METERS) {
      const ref = parseItemId(meterEarItemId(meter));
      expect(ref).toEqual({ kind: 'meter-ear', meter });
      expect(itemId(ref!)).toBe(`meter-ear:${meter}`);
    }
    expect(meterEar.kinds).toEqual(['meter-ear']);
  });

  it('rejects malformed IDs and meters it has no clip for', () => {
    for (const id of [
      'meter-ear:2/4',
      'meter-ear:06/8',
      'meter-ear:6/8:feltBeats',
      'meter:6/8',
      'meter-ear:',
      'meter-ear:7/8 (2+2+3)',
    ]) {
      expect(parseMeterEarItemId(id), id).toBeNull();
    }
    expect(() => meterEarItemId('2/4' as EarMeter)).toThrow(RangeError);
    expect(isEarMeter('9/8')).toBe(false);
  });

  it('splits the six meters two ways, each meter in exactly one set of each', () => {
    for (const sets of [METER_SETS_BY_KIND, METER_SETS_BY_BAR]) {
      const members = sets.flatMap((s) => s.members);
      expect([...members].sort()).toEqual([...EAR_METERS].sort());
      expect(new Set(sets.map((s) => s.id)).size).toBe(sets.length);
    }
  });

  it('pairs the confusables by bar: 6/8 with 3/4, 12/8 with 4/4', () => {
    const setOf = (m: EarMeter) => METER_SETS_BY_BAR.find((s) => s.members.includes(m))!.members;
    expect(setOf('6/8')).toContain('3/4');
    expect(setOf('12/8')).toContain('4/4');
  });
});
