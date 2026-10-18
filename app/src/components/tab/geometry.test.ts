import { describe, expect, it } from 'vitest';
import type { GuideLevel } from '../../engine/model';
import {
  COL_W,
  LINE_GAP,
  MAX_SCALE,
  MIN_HIT,
  NAME_W,
  PAD_X,
  computeTabGeometry,
  minScale,
  noteColumns,
} from './geometry';
import { showsLineName, tabGuide } from './guide';

describe('computeTabGeometry', () => {
  const g = computeTabGeometry({ lineCount: 6, columns: 4 });

  it('puts string 1 on the top line, one gap apart', () => {
    expect(g.lineY(1)).toBeLessThan(g.lineY(6));
    for (let s = 1; s < 6; s++) expect(g.lineY(s + 1) - g.lineY(s)).toBe(LINE_GAP);
    expect(g.lineY(1) - LINE_GAP / 2).toBe(g.top);
    expect(g.lineY(6) + LINE_GAP / 2).toBe(g.bottom);
    expect(g.height).toBeGreaterThan(g.bottom);
  });

  it('lays columns out left to right after the name gutter', () => {
    expect(g.staffLeft).toBe(PAD_X + NAME_W);
    expect(g.nameX).toBeLessThan(g.staffLeft);
    expect(g.columnX(0)).toBe(g.staffLeft + COL_W / 2);
    expect(g.columnX(3)).toBe(g.staffRight - COL_W / 2);
    expect(g.width).toBe(g.staffRight + PAD_X);
  });

  it('always has at least one column', () => {
    expect(computeTabGeometry({ lineCount: 6, columns: 0 }).columns).toBe(1);
  });

  it('keeps each line tap band ≥ 44pt at its smallest scale', () => {
    expect(LINE_GAP * minScale()).toBeGreaterThanOrEqual(MIN_HIT);
    expect(minScale()).toBeLessThanOrEqual(MAX_SCALE);
  });
});

describe('noteColumns', () => {
  it('gives each note a column', () => {
    expect(noteColumns(5)).toEqual({ columns: 5, offset: 0 });
    expect(noteColumns(0)).toEqual({ columns: 1, offset: 0 });
  });

  it('centres fewer notes than the minimum columns', () => {
    expect(noteColumns(1, 5)).toEqual({ columns: 5, offset: 2 });
    expect(noteColumns(2, 5)).toEqual({ columns: 5, offset: 1 });
    expect(noteColumns(6, 5)).toEqual({ columns: 6, offset: 0 });
  });
});

describe('tab guide levels', () => {
  const named = (level: GuideLevel) =>
    [1, 2, 3, 4, 5, 6].filter((s) => showsLineName(tabGuide(level), s, 6));

  it('fades the string names line by line', () => {
    expect(named(3)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(named(2)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(named(1)).toEqual([1, 6]);
    expect(named(0)).toEqual([]);
  });

  it('shows string numbers only at level 3', () => {
    expect(([0, 1, 2, 3] as GuideLevel[]).map((l) => tabGuide(l).numbers)).toEqual([
      false,
      false,
      false,
      true,
    ]);
  });
});
