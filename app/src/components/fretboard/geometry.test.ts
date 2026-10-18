import { describe, expect, it } from 'vitest';
import { MIN_HIT, STRING_GAP, computeGeometry, fretWidth, minScale } from './geometry';

describe('fretboard geometry', () => {
  const g = computeGeometry({
    fretRange: { from: 0, to: 15 },
    stringCount: 6,
    handedness: 'right',
  });

  it('lays out one cell per fret, narrowing gently up the neck', () => {
    expect(g.cells).toHaveLength(16);
    expect(fretWidth(1)).toBeGreaterThan(fretWidth(12));
    expect(fretWidth(15) / fretWidth(1)).toBeGreaterThan(0.7);
    for (let i = 1; i < g.cells.length; i++) {
      expect(g.cells[i]!.x).toBeGreaterThan(g.cells[i - 1]!.x);
    }
  });

  it('keeps every hit cell at least 44 units tall and wide', () => {
    expect(STRING_GAP).toBeGreaterThanOrEqual(44);
    for (const c of g.cells) expect(c.w).toBeGreaterThanOrEqual(44);
  });

  it('puts string 1 at the top and string 6 at the bottom', () => {
    expect(g.stringY(1)).toBeLessThan(g.stringY(6));
    expect(g.stringY(6)).toBeLessThan(g.neckBottom);
  });

  it('marks inlays including the double 12th', () => {
    expect(g.inlays.map((i) => i.fret)).toEqual([3, 5, 7, 9, 12, 15]);
    expect(g.inlays.find((i) => i.fret === 12)?.double).toBe(true);
    expect(g.wires[0]?.nut).toBe(true);
  });

  it('mirrors the neck for left-handed players', () => {
    const l = computeGeometry({
      fretRange: { from: 0, to: 15 },
      stringCount: 6,
      handedness: 'left',
    });
    expect(l.width).toBe(g.width);
    expect(l.cell(0)!.cx).toBeCloseTo(g.width - g.cell(0)!.cx);
    expect(l.cell(0)!.x).toBeGreaterThan(l.cell(15)!.x);
  });

  it('supports windows that exclude the nut', () => {
    const w = computeGeometry({
      fretRange: { from: 5, to: 9 },
      stringCount: 6,
      handedness: 'right',
    });
    expect(w.cells.map((c) => c.fret)).toEqual([5, 6, 7, 8, 9]);
    expect(w.wires.some((x) => x.nut)).toBe(false);
    expect(w.cell(4)).toBeUndefined();
  });

  it('computes the minimum scale that keeps cells tappable', () => {
    const scale = minScale(g);
    for (const c of g.cells) expect(c.w * scale).toBeGreaterThanOrEqual(MIN_HIT - 1e-9);
    expect(STRING_GAP * scale).toBeGreaterThanOrEqual(MIN_HIT);
  });
});
