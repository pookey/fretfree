import { describe, expect, it } from 'vitest';
import {
  MAP_BAND_H,
  MAP_CELL,
  MAP_PAD,
  MAP_STRING_GAP,
  cagedMapLayout,
  fretsText,
} from './caged-map';

// The C major chain, as the Explore visualiser builds it (lowest first).
const SPANS = [
  { shape: 'C', span: { from: 0, to: 3 } },
  { shape: 'A', span: { from: 3, to: 5 } },
  { shape: 'G', span: { from: 5, to: 8 } },
  { shape: 'E', span: { from: 8, to: 10 } },
  { shape: 'D', span: { from: 10, to: 13 } },
] as const;

const layout = (handedness: 'right' | 'left' = 'right', from = 0) =>
  cagedMapLayout({ range: { from, to: 15 }, spans: SPANS, current: 'A', strings: 6, handedness });

describe('cagedMapLayout', () => {
  it('sizes a whole 0–15 neck to the panel width, bands above the strings', () => {
    const m = layout();
    expect(m.width).toBe(16 * MAP_CELL);
    expect(m.neckTop).toBe(MAP_PAD + 2 * MAP_BAND_H + MAP_PAD);
    expect(m.neckBottom - m.neckTop).toBe(5 * MAP_STRING_GAP);
    expect(m.height).toBe(m.neckBottom + MAP_PAD);
  });

  it('puts string 1 on top and fret 0 left of the nut, right-handed', () => {
    const m = layout();
    expect(m.stringY(1)).toBe(m.neckTop);
    expect(m.stringY(6)).toBe(m.neckBottom);
    expect(m.fretX(0)).toBe(MAP_CELL / 2);
    expect(m.nutX).toBe(MAP_CELL);
    expect(m.fretX(0)).toBeLessThan(m.nutX!);
    // One wire at the high edge of each fretted cell, none on the nut.
    expect(m.wires).toHaveLength(15);
    expect(m.wires).not.toContain(m.nutX);
    expect(m.wires.at(-1)).toBe(m.width);
  });

  it('mirrors everything for a left-handed player', () => {
    const r = layout('right');
    const l = layout('left');
    expect(l.fretX(0)).toBe(r.width - r.fretX(0));
    expect(l.nutX).toBe(r.width - r.nutX!);
    const band = (m: typeof r) => m.bands.find((b) => b.shape === 'G')!;
    expect(band(l).x).toBe(r.width - band(r).x - band(r).width);
  });

  it('draws one band per shape, alternating rows so neighbours sharing a fret stay apart', () => {
    const m = layout();
    expect(m.bands.map((b) => b.shape)).toEqual(['C', 'A', 'G', 'E', 'D']);
    expect(m.bands.map((b) => b.row)).toEqual([0, 1, 0, 1, 0]);
    expect(m.bands.map((b) => b.current)).toEqual([false, true, false, false, false]);
    const a = m.bands[1]!;
    expect(a.x).toBe(3 * MAP_CELL);
    expect(a.width).toBe(3 * MAP_CELL);
    expect(a.y).toBe(MAP_PAD + MAP_BAND_H);
  });

  it('has no nut when the range starts above the open strings', () => {
    const m = layout('right', 1);
    expect(m.nutX).toBeNull();
    expect(m.fretX(1)).toBe(MAP_CELL / 2);
  });
});

describe('fretsText', () => {
  it('names one fret or a span', () => {
    expect(fretsText({ from: 3, to: 3 })).toBe('fret 3');
    expect(fretsText({ from: 3, to: 5 })).toBe('frets 3–5');
  });
});
