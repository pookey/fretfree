import { describe, expect, it } from 'vitest';
import {
  area,
  boxPoints,
  edgeDistance,
  ellipsePoints,
  flattenPath,
  inside,
  margin,
} from './footprint';

const SQUARE = flattenPath('M 0 0 L 100 0 L 100 100 L 0 100 Z');

describe('footprint helpers', () => {
  it('flattens lines and curves', () => {
    expect(SQUARE).toHaveLength(4);
    const curve = flattenPath('M 0 0 C 0 10 10 10 10 0 Z', 4);
    expect(curve).toHaveLength(5);
    expect(curve[4]).toEqual({ x: 10, y: 0 });
    expect(curve[2]!.y).toBeCloseTo(7.5);
  });

  it('refuses commands body files must not use', () => {
    expect(() => flattenPath('M 0 0 A 5 5 0 0 1 10 0 Z')).toThrow(/unsupported command A/);
  });

  it('measures area either way round', () => {
    expect(area(SQUARE)).toBe(10000);
    expect(area([...SQUARE].reverse())).toBe(10000);
  });

  it('measures signed room to the edge', () => {
    expect(inside({ x: 50, y: 50 }, SQUARE)).toBe(true);
    expect(inside({ x: 150, y: 50 }, SQUARE)).toBe(false);
    expect(edgeDistance({ x: 50, y: 10 }, SQUARE)).toBeCloseTo(10);
    expect(margin({ x: 50, y: 10 }, SQUARE)).toBeCloseTo(10);
    expect(margin({ x: 50, y: -5 }, SQUARE)).toBeCloseTo(-5);
  });

  it('places boxes and ellipses at their anchor, rotated', () => {
    const pts = boxPoints({ x0: -10, x1: 10, y0: -2, y1: 2 }, { x: 50, y: 50, angle: 90 });
    const ys = pts.map((p) => p.y);
    expect(Math.max(...ys)).toBeCloseTo(60);
    expect(Math.min(...ys)).toBeCloseTo(40);
    const ring = ellipsePoints({ rx: 5, ry: 5, dx: 1 }, { x: 0, y: 0 });
    expect(Math.max(...ring.map((p) => p.x))).toBeCloseTo(6);
  });
});
