import { describe, expect, it } from 'vitest';
import { CLICK_FADE_STEPS, fadeLadder, fadeStep, isAudible, type ClickFade } from './fade';
import { METER_PRESETS } from './meter';
import { clickAt, type ClickLayout } from './tempo';

const layout: ClickLayout = { meter: METER_PRESETS['6/8'], subdivide: 2, countInBars: 1 };
const clicks = Array.from({ length: 6 * 2 * 5 }, (_, i) => clickAt(layout, i));
const heard = (fade: ClickFade) =>
  clicks.filter((c) => !c.countIn && isAudible(c, fade)).map((c) => c.pulse);

describe('isAudible', () => {
  it('always sounds the count-in', () => {
    const countIn = clicks.filter((c) => c.countIn);
    expect(countIn).toHaveLength(12);
    expect(countIn.every((c) => isAudible(c, { keep: 'none' }))).toBe(true);
  });

  it('drops clicks step by step', () => {
    expect(heard({ keep: 'all' })).toHaveLength(48);
    expect(heard({ keep: 'pulses' })).toHaveLength(24);
    expect(heard({ keep: 'accents' })).toEqual([0, 3, 6, 9, 12, 15, 18, 21]);
    expect(heard({ keep: 'bars' })).toEqual([0, 6, 12, 18]);
    expect(heard({ keep: 'bars', everyBars: 2 })).toEqual([0, 12]);
    expect(heard({ keep: 'bars', everyBars: 0 })).toEqual([0, 6, 12, 18]);
    expect(heard({ keep: 'none' })).toEqual([]);
  });
});

describe('fadeLadder', () => {
  it('keeps every step for a compound meter with subdivisions', () => {
    expect(fadeLadder(METER_PRESETS['6/8'], 2)).toEqual(CLICK_FADE_STEPS);
  });

  it('drops the steps a simple meter without subdivisions cannot tell apart', () => {
    // No subdivisions: `pulses` is `all`. One group: `bars` is `accents`, and the first stays.
    expect(fadeLadder(METER_PRESETS['4/4'])).toEqual([
      { keep: 'all' },
      { keep: 'accents' },
      { keep: 'bars', everyBars: 2 },
      { keep: 'bars', everyBars: 4 },
      { keep: 'none' },
    ]);
  });
});

describe('fadeStep', () => {
  const cfg = { promoteAt: 0.9, demoteBelow: 0.75 };

  it('fades on high accuracy, brings the click back on low, holds in the band', () => {
    expect(fadeStep(1, 5, 0.95, cfg)).toBe(2);
    expect(fadeStep(1, 5, 0.6, cfg)).toBe(0);
    expect(fadeStep(1, 5, 0.85, cfg)).toBe(1);
  });

  it('stays on the ladder', () => {
    expect(fadeStep(4, 5, 1, cfg)).toBe(4);
    expect(fadeStep(0, 5, 0, cfg)).toBe(0);
    expect(fadeStep(9, 5, 0.85, cfg)).toBe(4);
    expect(fadeStep(-2, 5, 0.85)).toBe(0);
    expect(fadeStep(0, 0, 1, cfg)).toBe(0);
  });
});
