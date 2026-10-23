import { describe, expect, it } from 'vitest';
import { flattenPath, margin } from './footprint';
import { along, edgeAngle, edgeAt, inset, smoothClosed, stadium, type Pt } from './outline';

// A diamond: the curve through it is a rounded square, symmetric about both axes.
const DIAMOND: readonly Pt[] = [
  [0, -100],
  [100, 0],
  [0, 100],
  [-100, 0],
];
const ROUND = smoothClosed(DIAMOND);

describe('outline helpers', () => {
  it('fits a closed curve through every point', () => {
    expect(ROUND).toMatch(/^M 0 -100 (C [^C]+){4}Z$/);
    const poly = flattenPath(ROUND);
    for (const [x, y] of DIAMOND) {
      expect(poly.some((p) => Math.hypot(p.x - x, p.y - y) < 1e-6)).toBe(true);
    }
  });

  it('finds the outermost edge on each side', () => {
    const bass = edgeAt(ROUND, 'bass', 0);
    const treble = edgeAt(ROUND, 'treble', 0);
    expect(bass.point.x).toBeCloseTo(-100, 0);
    expect(treble.point.x).toBeCloseTo(100, 0);
    expect(bass.tangent.y).toBeGreaterThan(0);
    expect(() => edgeAt(ROUND, 'bass', 500)).toThrow(/doesn't reach/);
  });

  it('insets along the inward normal', () => {
    const poly = flattenPath(ROUND);
    for (const side of ['bass', 'treble'] as const) {
      const [x, y] = inset(ROUND, side, 30, 12);
      expect(margin({ x, y }, poly)).toBeGreaterThan(11);
      expect(margin({ x, y }, poly)).toBeLessThan(13);
    }
  });

  it('turns a part to run along the edge', () => {
    expect(Math.abs(edgeAngle(ROUND, 'treble', 0))).toBeLessThan(6);
    // Below the widest point the treble edge heads in and down: turned clockwise.
    expect(edgeAngle(ROUND, 'treble', 60)).toBeGreaterThan(10);
    expect(edgeAngle(ROUND, 'bass', 60)).toBeLessThan(-10);
  });

  it('draws a rounded slot and points along it', () => {
    const slot = flattenPath(stadium([0, 0], [0, 100], 10));
    const xs = slot.map((p) => p.x);
    const ys = slot.map((p) => p.y);
    expect(Math.min(...xs)).toBeCloseTo(-10);
    expect(Math.max(...ys)).toBeCloseTo(110);
    expect(along([0, 0], [10, 20], 0.5)).toEqual([5, 10]);
  });
});
