// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { computeGeometry, minScale } from '../components/fretboard/geometry';
import {
  COMPACT_NECK_CHROME,
  compactWindowFrets,
  isShortLandscape,
  neckRegions,
  neckWindow,
  sizeClassFor,
  targetsByRegion,
  useCompactWindowFrets,
} from './size-class';

describe('sizeClassFor', () => {
  it('classifies iPad and iPhone viewports by width', () => {
    expect(sizeClassFor(1194, 834)).toBe('regular-wide'); // iPad Pro 11 landscape
    expect(sizeClassFor(1024, 768)).toBe('regular-wide'); // iPad mini landscape
    expect(sizeClassFor(834, 1194)).toBe('regular'); // iPad Pro 11 portrait
    expect(sizeClassFor(744, 1133)).toBe('regular'); // iPad mini portrait
    expect(sizeClassFor(390, 844)).toBe('compact'); // iPhone portrait
  });

  it('treats short landscape phones as compact', () => {
    expect(sizeClassFor(852, 393)).toBe('compact');
  });
});

describe('neckWindow', () => {
  it('shows the full neck on regular-wide', () => {
    expect(neckWindow('regular-wide', 3)).toEqual({ from: 0, to: 15 });
  });

  it('shows 12 frets on regular, shifting up for high frets', () => {
    expect(neckWindow('regular', 5)).toEqual({ from: 0, to: 12 });
    expect(neckWindow('regular', 14)).toEqual({ from: 3, to: 15 });
  });

  it('slides a 5-fret window on compact', () => {
    expect(neckWindow('compact', 0)).toEqual({ from: 0, to: 4 });
    expect(neckWindow('compact', 7)).toEqual({ from: 5, to: 9 });
    expect(neckWindow('compact', 15)).toEqual({ from: 11, to: 15 });
  });
});

describe('neckWindow with a wider compact window', () => {
  it('centres a wider window on the focus fret, clamped to the neck', () => {
    expect(neckWindow('compact', 0, 10)).toEqual({ from: 0, to: 9 });
    expect(neckWindow('compact', 8, 10)).toEqual({ from: 4, to: 13 });
    expect(neckWindow('compact', 15, 10)).toEqual({ from: 6, to: 15 });
    expect(neckWindow('compact', 7, 30)).toEqual({ from: 0, to: 15 });
  });

  it('leaves the iPad necks alone', () => {
    expect(neckWindow('regular-wide', 3, 10)).toEqual({ from: 0, to: 15 });
    expect(neckWindow('regular', 3, 10)).toEqual({ from: 0, to: 12 });
  });
});

describe('isShortLandscape', () => {
  it('is a short window wider than it is tall', () => {
    expect(isShortLandscape(734, 343)).toBe(true); // iPhone 15 landscape
    expect(isShortLandscape(393, 659)).toBe(false); // iPhone 15 portrait
    expect(isShortLandscape(1194, 834)).toBe(false); // iPad landscape
    expect(isShortLandscape(400, 450)).toBe(false); // a small square window
  });
});

describe('compactWindowFrets', () => {
  it('keeps the 5-fret window in portrait', () => {
    expect(compactWindowFrets(393, 659)).toBe(5);
    expect(compactWindowFrets(320, 568)).toBe(5);
  });

  it('widens the window on a phone on its side, more on bigger phones', () => {
    // The string names' column at the nut (M1-49) costs the SE and the Pro Max a fret.
    expect(compactWindowFrets(568, 320)).toBe(6); // iPhone SE (1st gen)
    expect(compactWindowFrets(734, 343)).toBe(10); // iPhone 15
    expect(compactWindowFrets(814, 380)).toBe(11); // iPhone 15 Pro Max
  });

  it('never shows less than 5 frets or more than the neck', () => {
    expect(compactWindowFrets(480, 300)).toBe(5);
    expect(compactWindowFrets(4000, 400)).toBe(16);
  });

  it('picks a window whose neck fits the width wherever it sits, at its minimum hit size', () => {
    for (const [w, h] of [
      [568, 320],
      [734, 343],
      [814, 380],
    ] as const) {
      const frets = compactWindowFrets(w, h);
      const width = (from: number, frets: number) => {
        const g = computeGeometry({
          fretRange: { from, to: from + frets - 1 },
          stringCount: 6,
          handedness: 'right',
        });
        return g.width * minScale(g);
      };
      for (let from = 0; from + frets - 1 <= 15; from++) {
        expect(width(from, frets)).toBeLessThanOrEqual(w - COMPACT_NECK_CHROME);
      }
      // One more fret would not fit next to the nut.
      expect(width(0, frets + 1)).toBeGreaterThan(w - COMPACT_NECK_CHROME);
    }
  });
});

describe('neckRegions', () => {
  it('keeps the whole range on iPad', () => {
    expect(neckRegions('regular-wide', { from: 0, to: 15 })).toEqual([{ from: 0, to: 15 }]);
    expect(neckRegions('regular', { from: 0, to: 12 })).toEqual([{ from: 0, to: 12 }]);
  });

  it('splits a whole-neck range into balanced compact regions', () => {
    expect(neckRegions('compact', { from: 0, to: 15 })).toEqual([
      { from: 0, to: 3 },
      { from: 4, to: 7 },
      { from: 8, to: 11 },
      { from: 12, to: 15 },
    ]);
    expect(neckRegions('compact', { from: 0, to: 12 }, 10)).toEqual([
      { from: 0, to: 6 },
      { from: 7, to: 12 },
    ]);
  });

  it('keeps a range that already fits the window', () => {
    expect(neckRegions('compact', { from: 3, to: 7 })).toEqual([{ from: 3, to: 7 }]);
  });

  it('treats a zero-fret window as one fret per region', () => {
    expect(neckRegions('compact', { from: 0, to: 2 }, 0)).toHaveLength(3);
  });
});

describe('targetsByRegion', () => {
  it('groups targets by region in order and drops empty regions', () => {
    const regions = neckRegions('compact', { from: 0, to: 15 });
    const gs = [
      { string: 6, fret: 3 },
      { string: 6, fret: 15 },
      { string: 1, fret: 3 },
      { string: 3, fret: 12 },
    ];
    expect(targetsByRegion(gs, regions)).toEqual([
      { region: { from: 0, to: 3 }, targets: [gs[0], gs[2]] },
      { region: { from: 12, to: 15 }, targets: [gs[1], gs[3]] },
    ]);
  });
});

describe('useCompactWindowFrets', () => {
  const size = { w: window.innerWidth, h: window.innerHeight };
  const resize = (w: number, h: number) => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: w });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: h });
    window.dispatchEvent(new Event('resize'));
  };
  afterEach(() => resize(size.w, size.h));

  it('follows the viewport as the phone rotates', () => {
    resize(393, 659);
    const { result } = renderHook(() => useCompactWindowFrets());
    expect(result.current).toBe(5);
    act(() => resize(734, 343));
    expect(result.current).toBe(10);
  });
});
