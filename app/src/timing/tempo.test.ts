import { describe, expect, it } from 'vitest';
import { METER_PRESETS } from './meter';
import {
  changeTempo,
  checkLayout,
  clickAt,
  countInPulses,
  pulseAtTime,
  pulseMs,
  pulseOfClick,
  tempoMap,
  timeAtPulse,
  type ClickLayout,
} from './tempo';

describe('tempo map', () => {
  it('maps pulses to times at a steady tempo, before its start too', () => {
    const map = tempoMap(120, 1000, -4);
    expect(pulseMs(120)).toBe(500);
    expect(timeAtPulse(map, -4)).toBe(1000);
    expect(timeAtPulse(map, 0)).toBe(3000);
    expect(timeAtPulse(map, -5)).toBe(500);
    expect(pulseAtTime(map, 3250)).toBe(0.5);
  });

  it('changes tempo from a pulse on, and round-trips through the change', () => {
    const map = changeTempo(tempoMap(120, 0), 4, 60);
    expect(timeAtPulse(map, 4)).toBe(2000);
    expect(timeAtPulse(map, 6)).toBe(4000);
    expect(timeAtPulse(map, 3)).toBe(1500);
    for (const pulse of [0, 1.5, 4, 5.25, 10]) {
      expect(pulseAtTime(map, timeAtPulse(map, pulse))).toBeCloseTo(pulse, 9);
    }
  });

  it('a new change drops the changes after it', () => {
    let map = changeTempo(tempoMap(120, 0), 8, 60);
    map = changeTempo(map, 4, 240);
    expect(map.map((s) => s.pulse)).toEqual([0, 4]);
    expect(timeAtPulse(map, 8)).toBe(3000);
  });

  it('rejects a bad tempo or an empty map', () => {
    expect(() => tempoMap(0, 0)).toThrow(RangeError);
    expect(() => pulseMs(Number.NaN)).toThrow(RangeError);
    expect(() => timeAtPulse([], 0)).toThrow(RangeError);
  });
});

describe('click grid', () => {
  const four: ClickLayout = { meter: METER_PRESETS['4/4'], subdivide: 1, countInBars: 1 };

  it('starts with a count-in bar of negative pulses', () => {
    expect(countInPulses(four)).toBe(4);
    const first = clickAt(four, 0);
    expect(first).toEqual({
      index: 0,
      pulse: -4,
      bar: -1,
      pulseInBar: 0,
      accent: 'bar',
      countIn: true,
    });
    expect(clickAt(four, 4)).toMatchObject({ pulse: 0, bar: 0, accent: 'bar', countIn: false });
    expect(clickAt(four, 7)).toMatchObject({ pulse: 3, bar: 0, pulseInBar: 3, accent: 'pulse' });
    expect(clickAt(four, 8)).toMatchObject({ bar: 1, pulseInBar: 0, accent: 'bar' });
  });

  it('places subdivisions between pulses without spilling into the next bar', () => {
    const triplets: ClickLayout = { meter: METER_PRESETS['3/4'], subdivide: 3, countInBars: 0 };
    const last = clickAt(triplets, 8);
    expect(last.accent).toBe('sub');
    expect(last.bar).toBe(0);
    expect(last.pulseInBar).toBeCloseTo(2 + 2 / 3, 9);
    expect(clickAt(triplets, 9)).toMatchObject({ bar: 1, pulseInBar: 0, accent: 'bar' });
    expect(pulseOfClick(triplets, 4)).toBeCloseTo(4 / 3, 9);
  });

  it('accents odd groupings across bars', () => {
    const seven: ClickLayout = { meter: METER_PRESETS['7/8 (2+2+3)'], subdivide: 1, countInBars: 0 };
    const accents = Array.from({ length: 14 }, (_, i) => clickAt(seven, i).accent);
    expect(accents.slice(7)).toEqual(accents.slice(0, 7));
    expect(accents.slice(0, 5)).toEqual(['bar', 'pulse', 'group', 'pulse', 'group']);
  });

  it('rejects a bad layout', () => {
    expect(() => checkLayout({ ...four, subdivide: 5 })).toThrow(RangeError);
    expect(() => checkLayout({ ...four, subdivide: 1.5 })).toThrow(RangeError);
    expect(() => checkLayout({ ...four, countInBars: -1 })).toThrow(RangeError);
    expect(checkLayout(four)).toBe(four);
  });
});
