import { describe, expect, it } from 'vitest';
import { INLAY_FRETS } from '../../theory';
import {
  DEFAULT_FRETS,
  SCALE,
  boardEnd,
  boardHalfWidth,
  fretY,
  inlayMarks,
  stringX,
  tunerKey,
  tunerPost,
} from './geometry';
import { frameBox } from './frame';

describe('guitar geometry', () => {
  it('puts the 12th fret halfway to the saddles', () => {
    expect(fretY(0)).toBe(0);
    expect(fretY(12)).toBeCloseTo(SCALE / 2);
    expect(fretY(24)).toBeCloseTo((SCALE * 3) / 4);
  });

  it('widens the board towards the heel', () => {
    expect(boardHalfWidth(boardEnd(DEFAULT_FRETS))).toBeGreaterThan(boardHalfWidth(0));
  });

  it('keeps the low E on the left and every string on the board', () => {
    for (const y of [0, fretY(12), boardEnd(DEFAULT_FRETS)]) {
      const xs = [1, 2, 3, 4, 5, 6].map((s) => stringX(s, y));
      expect(xs).toEqual([...xs].sort((a, b) => b - a));
      for (const x of xs) expect(Math.abs(x)).toBeLessThan(boardHalfWidth(y));
    }
  });

  it('gives each string its own tuner, three a side', () => {
    const posts = [1, 2, 3, 4, 5, 6].map(tunerPost);
    expect(new Set(posts.map((p) => `${p.x},${p.y}`)).size).toBe(6);
    expect(posts.filter((p) => p.x < 0)).toHaveLength(3);
    // The low E and high E posts sit nearest the nut.
    expect(tunerPost(6).y).toBe(tunerPost(1).y);
    expect(tunerPost(6).y).toBeGreaterThan(tunerPost(4).y);
    expect(Math.abs(tunerKey(6).x)).toBeGreaterThan(Math.abs(tunerPost(6).x));
  });

  it.each(['dots', 'blocks', 'trapezoids'] as const)(
    'keeps %s at the standard positions',
    (shape) => {
      const marks = inlayMarks(shape, 22);
      expect(marks.map((m) => m.fret)).toEqual(INLAY_FRETS.filter((f) => f <= 22));
      for (const m of marks) {
        const expected = shape === 'dots' && m.fret === 12 ? 2 : 1;
        expect(m.paths).toHaveLength(expected);
      }
    },
  );

  it('drops inlays past the last fret', () => {
    expect(inlayMarks('dots', 20).map((m) => m.fret)).not.toContain(21);
  });

  it('sizes a guitar by height, or fills its container', () => {
    expect(frameBox(10)).toEqual({ width: `${(10 * 370) / 1010}rem`, height: '10rem' });
    expect(frameBox('fill', 'body')).toEqual({ width: '100%', aspectRatio: '370 / 502' });
  });
});
