import { describe, expect, it } from 'vitest';
import { FORM_SHAPES } from '../../engine/items/form';
import { FORMS, endingBars, nextBar, playOrder, repeatStartFor } from './forms';

/** Each road map's play order, as bar numbers. */
const ORDERS: Record<string, string> = {
  'repeat-all': '1 2 3 4 1 2 3 4',
  'repeat-inner': '1 2 3 2 3 4',
  'repeat-from-start': '1 2 3 1 2 3 4',
  'repeat-tail': '1 2 3 4 3 4',
  'repeat-twice': '1 2 1 2 3 4 3 4',
  endings: '1 2 3 4 1 2 3 5',
  'endings-from-start': '1 2 3 4 1 2 3 5',
  'endings-inner': '1 2 3 4 2 3 5 6',
  'endings-long': '1 2 3 4 1 2 5 6',
};

/** What each `next` card's answer is, as a bar number. */
const NEXT: Record<string, number> = {
  'repeat-all': 1,
  'repeat-inner': 2,
  'repeat-from-start': 1,
  'repeat-tail': 3,
  'repeat-twice': 3,
  endings: 5,
  'endings-from-start': 1,
  'endings-inner': 5,
  'endings-long': 5,
};

describe('road maps', () => {
  it('lays out every shape the items name', () => {
    expect(Object.keys(FORMS).sort()).toEqual([...FORM_SHAPES].sort());
  });

  it.each(FORM_SHAPES)('plays %s in the order a reader does', (shape) => {
    const order = playOrder(FORMS[shape].bars);
    expect(order.map((i) => i + 1).join(' ')).toBe(ORDERS[shape]);
    // Every bar is played, and none more than twice.
    for (let i = 0; i < FORMS[shape].bars.length; i++) {
      const plays = order.filter((b) => b === i).length;
      expect(plays).toBeGreaterThanOrEqual(1);
      expect(plays).toBeLessThanOrEqual(2);
    }
  });

  it.each(FORM_SHAPES)('asks %s about a turn, not a bar played straight on', (shape) => {
    const { bars, ask } = FORMS[shape];
    const next = nextBar(playOrder(bars), ask.bar, ask.time);
    expect(next).not.toBeNull();
    expect(next! + 1).toBe(NEXT[shape]);
    expect(next).not.toBe(ask.bar + 1);
  });

  it('finds the bar after a given play of a bar, or null past the end', () => {
    const order = playOrder(FORMS['repeat-inner'].bars);
    expect(nextBar(order, 2, 1)).toBe(1);
    expect(nextBar(order, 2, 2)).toBe(3);
    expect(nextBar(order, 3, 1)).toBeNull();
    expect(nextBar(order, 0, 2)).toBeNull();
  });

  it('finds the begin repeat an end repeat goes back to', () => {
    expect(repeatStartFor(FORMS['repeat-inner'].bars, 2)).toBe(1);
    expect(repeatStartFor(FORMS['repeat-from-start'].bars, 2)).toBeNull();
    expect(repeatStartFor(FORMS['repeat-twice'].bars, 3)).toBe(2);
    expect(repeatStartFor(FORMS['repeat-twice'].bars, 1)).toBe(0);
    // A repeat taken before closes the search.
    expect(repeatStartFor([{ repeatEnd: true }, {}, { repeatEnd: true }], 2)).toBeNull();
  });

  it('lists the bars under each ending', () => {
    expect(endingBars(FORMS['endings-long'].bars, 1)).toEqual([2, 3]);
    expect(endingBars(FORMS['endings-long'].bars, 2)).toEqual([4, 5]);
    expect(endingBars(FORMS['repeat-all'].bars, 1)).toEqual([]);
  });
});
