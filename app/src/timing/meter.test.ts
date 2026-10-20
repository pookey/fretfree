import { describe, expect, it } from 'vitest';
import { METER_PRESETS, accentPattern, checkMeter, groupingLabel, pulsesPerBar } from './meter';

describe('accentPattern', () => {
  it('stresses only the downbeat of a simple meter', () => {
    expect(accentPattern(METER_PRESETS['4/4'])).toEqual(['bar', 'pulse', 'pulse', 'pulse']);
    expect(accentPattern(METER_PRESETS['3/4'])).toEqual(['bar', 'pulse', 'pulse']);
  });

  it('stresses each felt beat of a compound meter', () => {
    expect(accentPattern(METER_PRESETS['6/8'])).toEqual([
      'bar',
      'pulse',
      'pulse',
      'group',
      'pulse',
      'pulse',
    ]);
    expect(accentPattern(METER_PRESETS['12/8']).filter((a) => a !== 'pulse')).toEqual([
      'bar',
      'group',
      'group',
      'group',
    ]);
  });

  it('follows odd groupings in order', () => {
    expect(accentPattern(METER_PRESETS['5/8 (3+2)'])).toEqual([
      'bar',
      'pulse',
      'pulse',
      'group',
      'pulse',
    ]);
    expect(accentPattern(METER_PRESETS['7/8 (2+2+3)'])).toEqual([
      'bar',
      'pulse',
      'group',
      'pulse',
      'group',
      'pulse',
      'pulse',
    ]);
  });

  it('rejects empty or fractional groups', () => {
    expect(() => accentPattern({ groups: [], unit: 4 })).toThrow(RangeError);
    expect(() => checkMeter({ groups: [2, 0], unit: 8 })).toThrow(RangeError);
    expect(() => checkMeter({ groups: [1.5], unit: 8 })).toThrow(RangeError);
  });
});

describe('meter helpers', () => {
  it('counts pulses and labels groupings', () => {
    expect(pulsesPerBar(METER_PRESETS['7/8 (3+2+2)'])).toBe(7);
    expect(groupingLabel(METER_PRESETS['7/8 (3+2+2)'])).toBe('3+2+2');
    expect(groupingLabel(METER_PRESETS['4/4'])).toBe('4');
  });

  it('every preset is valid, and its name agrees with its pulse count', () => {
    for (const [name, meter] of Object.entries(METER_PRESETS)) {
      expect(checkMeter(meter)).toBe(meter);
      const [top, bottom] = name.split(' ')[0]!.split('/').map(Number);
      expect(pulsesPerBar(meter), name).toBe(top);
      expect(meter.unit, name).toBe(bottom);
    }
  });
});
