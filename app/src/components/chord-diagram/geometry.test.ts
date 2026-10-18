import { describe, expect, it } from 'vitest';
import {
  FRET_GAP,
  STRING_GAP,
  computeChartGeometry,
  hexagonPoints,
  trianglePoints,
} from './geometry';

const g = (handedness: 'right' | 'left', baseFret = 1, rows = 4) =>
  computeChartGeometry({ stringCount: 6, baseFret, rows, handedness });

describe('computeChartGeometry', () => {
  it('puts the low string on the left for right-handers and mirrors for left-handers', () => {
    const r = g('right');
    expect(r.stringX(6)).toBe(r.neckLeft);
    expect(r.stringX(1)).toBe(r.neckRight);
    expect(r.stringX(5) - r.stringX(6)).toBe(STRING_GAP);
    const l = g('left');
    expect(l.stringX(1)).toBe(l.neckLeft);
    expect(l.stringX(6)).toBe(l.neckRight);
    expect(l.width).toBe(r.width);
  });

  it('stacks fret rows down from the nut, relative to the base fret', () => {
    const r = g('right', 5, 5);
    expect(r.neckBottom - r.neckTop).toBe(5 * FRET_GAP);
    expect(r.fretY(5)).toBe(r.neckTop + FRET_GAP / 2);
    expect(r.fretY(7)).toBe(r.neckTop + 2.5 * FRET_GAP);
    expect(r.wireY(0)).toBe(r.neckTop);
    expect(r.wireY(5)).toBe(r.neckBottom);
    expect(r.headY).toBeLessThan(r.neckTop);
    expect(r.footY).toBeGreaterThan(r.neckBottom);
    expect(r.height).toBeGreaterThan(r.footY);
  });
});

describe('marker shapes', () => {
  it('centres the triangle and hexagon on the dot', () => {
    const tri = trianglePoints(100, 50)
      .split(' ')
      .map((p) => p.split(',').map(Number));
    expect(tri).toHaveLength(3);
    expect(tri[0]![0]).toBe(100);
    expect(tri[1]![0]! - 100).toBeCloseTo(100 - tri[2]![0]!);
    const hex = hexagonPoints(100, 50, 10)
      .split(' ')
      .map((p) => p.split(',').map(Number));
    expect(hex).toHaveLength(6);
    expect(hex[0]).toEqual([111, 50]);
    expect(hex[3]).toEqual([89, 50]);
  });
});
