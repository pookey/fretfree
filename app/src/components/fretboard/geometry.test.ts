import { describe, expect, it } from 'vitest';
import { DROP_D_TUNING, STANDARD_TUNING, noteAt, type Tuning } from '../../theory';
import type { MarkerStyle } from './Fretboard';
import {
  MARKER_SHAPE,
  MIN_HIT,
  NAME_W,
  PAD_X,
  STRING_GAP,
  computeGeometry,
  fretWidth,
  markerBox,
  minScale,
  overlaps,
  stringNameBox,
} from './geometry';
import { neckText } from './labels';

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

  describe('string names at the nut (M1-49)', () => {
    const styles = Object.keys(MARKER_SHAPE) as MarkerStyle[];
    const openNames = (tuning: Tuning) =>
      [1, 2, 3, 4, 5, 6].map((s) => ({
        string: s,
        name: neckText(noteAt({ string: s, fret: 0 }, tuning).pc),
      }));

    it('gives the names their own column beyond the open strings, either hand', () => {
      expect(g.names).toEqual({ x: 1, w: NAME_W - 1, cx: NAME_W / 2 });
      expect(g.names!.x + g.names!.w).toBe(g.cell(0)!.x);
      expect(g.cell(0)!.x).toBe(NAME_W);
      const l = computeGeometry({
        fretRange: { from: 0, to: 15 },
        stringCount: 6,
        handedness: 'left',
      });
      expect(l.width).toBe(g.width);
      expect(l.names!.x + l.names!.w).toBe(l.width - 1);
      expect(l.cell(0)!.x + l.cell(0)!.w).toBe(l.names!.x);
    });

    it('leaves the column out without the nut, or when asked', () => {
      const up = computeGeometry({
        fretRange: { from: 5, to: 9 },
        stringCount: 6,
        handedness: 'right',
      });
      expect(up.names).toBeUndefined();
      expect(up.cells[0]!.x).toBe(PAD_X);
      expect(stringNameBox(up, 1, 'E')).toBeUndefined();
      const bare = computeGeometry({
        fretRange: { from: 0, to: 15 },
        stringCount: 6,
        handedness: 'right',
        nameGutter: false,
      });
      expect(bare.names).toBeUndefined();
      expect(bare.cell(0)!.x).toBe(PAD_X);
      expect(bare.width).toBe(g.width - NAME_W + PAD_X);
    });

    it.each([
      ['standard', STANDARD_TUNING],
      ['drop D', DROP_D_TUNING],
    ] as const)('no %s name box meets any open marker, ringed or not, either hand', (_, tuning) => {
      for (const handedness of ['right', 'left'] as const) {
        const neck = computeGeometry({
          fretRange: { from: 0, to: 12 },
          stringCount: 6,
          handedness,
        });
        const open = neck.cell(0)!;
        for (const { string, name } of openNames(tuning)) {
          const label = stringNameBox(neck, string, name)!;
          expect(label.x).toBeGreaterThanOrEqual(Math.min(neck.names!.x, 0));
          expect(label.x + label.w).toBeLessThanOrEqual(neck.width);
          for (const style of styles) {
            for (const emphasis of [false, true]) {
              const marker = markerBox(
                MARKER_SHAPE[style],
                open.cx,
                neck.stringY(string),
                emphasis,
              );
              expect(overlaps(label, marker), `${name} vs ${style}`).toBe(false);
            }
          }
        }
      }
    });

    it('clears a sharp or flat name too, beside any unringed open marker', () => {
      const open = g.cell(0)!;
      for (const name of ['F♯', 'B♭', 'C♯']) {
        const label = stringNameBox(g, 6, name)!;
        expect(label.x).toBeGreaterThanOrEqual(0);
        for (const style of styles) {
          const marker = markerBox(MARKER_SHAPE[style], open.cx, g.stringY(6));
          expect(overlaps(label, marker), `${name} vs ${style}`).toBe(false);
        }
      }
    });

    it('keeps a name inside its string band, clear of its neighbours', () => {
      const a = stringNameBox(g, 1, 'E')!;
      const b = stringNameBox(g, 2, 'B')!;
      expect(overlaps(a, b)).toBe(false);
      expect(a.h).toBeLessThan(STRING_GAP);
    });

    it('measures overlap on both axes', () => {
      const box = { x: 0, y: 0, w: 10, h: 10 };
      expect(overlaps(box, { x: 5, y: 5, w: 10, h: 10 })).toBe(true);
      expect(overlaps(box, { x: 10, y: 0, w: 10, h: 10 })).toBe(false);
      expect(overlaps(box, { x: 0, y: 12, w: 10, h: 10 })).toBe(false);
    });
  });
});
