import { describe, expect, it } from 'vitest';
import {
  INTERACTIVE_SCALE,
  MIN_LINE_GAP_PT,
  READING_SCALE,
  SPACE,
  STEP,
  TAB_GAP,
  computeStaffGeometry,
  defaultRange,
  scaleFor,
} from './geometry';

describe('staff geometry', () => {
  const empty = computeStaffGeometry({ notePositions: [] });

  it('puts lines a space apart, the bottom line at position 0', () => {
    expect(empty.bottomLineY - empty.topLineY).toBe(4 * SPACE);
    expect(empty.positionY(0)).toBe(empty.bottomLineY);
    expect(empty.positionY(8)).toBe(empty.topLineY);
    expect(empty.positionY(1) - empty.positionY(2)).toBe(STEP);
    expect(empty.staveY).toBe(empty.topLineY - 4 * SPACE);
  });

  it('defaults the range to the staff and its outer spaces', () => {
    expect(empty.range).toEqual([-1, 9]);
    expect(defaultRange([-7, 3])).toEqual([-8, 9]);
    expect(defaultRange([12])).toEqual([-1, 13]);
  });

  it('keeps every tappable position inside the drawing', () => {
    const g = computeStaffGeometry({ notePositions: [[-7]], range: [-9, 15] });
    expect(g.positionY(15)).toBeGreaterThan(0);
    expect(g.positionY(-9)).toBeLessThan(g.height);
  });

  it('leaves room for stems and the clef', () => {
    // A stem-up note low down reaches 3.5 spaces above its head.
    const low = computeStaffGeometry({ notePositions: [[10]] });
    const high = computeStaffGeometry({ notePositions: [[16]] });
    expect(high.topLineY).toBeGreaterThan(low.topLineY);
    // A stem-down note high up reaches below the staff.
    const g = computeStaffGeometry({ notePositions: [[-4, 6]] });
    expect(g.height - g.bottomLineY).toBeGreaterThan(4 * STEP);
  });

  it('maps a y back to the nearest position, clamped to the range', () => {
    const g = computeStaffGeometry({ notePositions: [], range: [-3, 11] });
    for (let p = -3; p <= 11; p++) {
      expect(g.positionAt(g.positionY(p))).toBe(p);
      expect(g.positionAt(g.positionY(p) + STEP * 0.4)).toBe(p);
      expect(g.positionAt(g.positionY(p) - STEP * 0.4)).toBe(p);
    }
    expect(g.positionAt(-1000)).toBe(11);
    expect(g.positionAt(1000)).toBe(-3);
  });

  it('adds the tab stave under the staff', () => {
    const g = computeStaffGeometry({ notePositions: [[0]], tab: true });
    expect(g.tabTopLineY).toBeGreaterThanOrEqual(g.positionY(g.range[0]) + TAB_GAP);
    expect(g.tabStaveY).toBeLessThan(g.tabTopLineY!);
    expect(g.height).toBeGreaterThan(computeStaffGeometry({ notePositions: [[0]] }).height + 60);
    expect(empty.tabTopLineY).toBeUndefined();
  });

  it('widens for key and time signatures and for notes', () => {
    const plain = empty.width;
    expect(computeStaffGeometry({ notePositions: [], keyAccidentals: 3 }).width).toBeGreaterThan(
      plain,
    );
    expect(computeStaffGeometry({ notePositions: [], timeSignature: true }).width).toBeGreaterThan(
      plain,
    );
    expect(computeStaffGeometry({ notePositions: [[0], [1], [2], [3]] }).width).toBeGreaterThan(
      plain,
    );
    expect(empty.answerX).toBeGreaterThan(0);
    expect(empty.answerX).toBeLessThan(empty.width);
  });
});

describe('render scale', () => {
  it('keeps an interactive staff’s lines 44pt apart', () => {
    expect(scaleFor(true)).toBe(INTERACTIVE_SCALE);
    expect(INTERACTIVE_SCALE.min * SPACE).toBeGreaterThanOrEqual(MIN_LINE_GAP_PT);
    expect(INTERACTIVE_SCALE.min * STEP).toBeGreaterThanOrEqual(22);
  });

  it('reads at a comfortable size otherwise', () => {
    expect(scaleFor(false)).toBe(READING_SCALE);
    expect(READING_SCALE.min).toBeLessThan(READING_SCALE.max);
  });
});
