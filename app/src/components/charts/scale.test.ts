import { describe, expect, it } from 'vitest';
import { labelIndices, niceTicks, seconds, shortDate } from './scale';

describe('niceTicks', () => {
  it('covers the maximum in round steps from 0', () => {
    expect(niceTicks(42)).toEqual([0, 20, 40, 60]);
    expect(niceTicks(9)).toEqual([0, 2.5, 5, 7.5, 10]);
    expect(niceTicks(3200)).toEqual([0, 1000, 2000, 3000, 4000]);
    expect(niceTicks(4)).toEqual([0, 1, 2, 3, 4]);
    expect(niceTicks(2)).toEqual([0, 0.5, 1, 1.5, 2]);
  });

  it('keeps steps whole for counts', () => {
    expect(niceTicks(2, 4, true)).toEqual([0, 1, 2]);
    expect(niceTicks(9, 4, true)).toEqual([0, 3, 6, 9]);
  });

  it('has a unit axis when there is nothing to show', () => {
    expect(niceTicks(0)).toEqual([0, 1]);
    expect(niceTicks(Number.NaN)).toEqual([0, 1]);
  });
});

describe('labelIndices', () => {
  it('labels every position when they fit', () => {
    expect(labelIndices(3, 6)).toEqual([0, 1, 2]);
    expect(labelIndices(0, 6)).toEqual([]);
  });

  it('keeps the first and last and spaces the rest', () => {
    expect(labelIndices(30, 4)).toEqual([0, 10, 19, 29]);
    expect(labelIndices(30, 1)).toEqual([29]);
  });
});

describe('formatting', () => {
  it('writes short dates and seconds', () => {
    expect(shortDate('2026-10-23')).toBe('23 Oct');
    expect(shortDate('nope')).toBe('nope');
    expect(seconds(1234)).toBe('1.2 s');
  });
});
