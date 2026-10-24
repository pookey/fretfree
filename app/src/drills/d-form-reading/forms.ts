import type { FormShape } from '../../engine/items/form';

/**
 * The road maps T6 reads (`form:<shape>:…` items): which bars carry a begin
 * or end repeat, and which belong to a 1st or 2nd ending. Bars are indexed
 * from 0 here and numbered from 1 on screen; road maps have no pickup, so
 * bar `i` is bar `i + 1`.
 */

export interface FormMarks {
  /** A begin repeat `|:` at the bar's start. */
  repeatStart?: true;
  /** An end repeat `:|` at the bar's end. */
  repeatEnd?: true;
  /** The ending bracket over the bar. */
  ending?: 1 | 2;
}

export interface FormLayout {
  bars: readonly FormMarks[];
  /**
   * What the `next` card asks: which bar follows this one (an index), the
   * first or the second time it is played. It is where the road map turns.
   */
  ask: { bar: number; time: 1 | 2 };
}

const S = { repeatStart: true } as const;
const E = { repeatEnd: true } as const;
const plain = {};

export const FORMS: Readonly<Record<FormShape, FormLayout>> = {
  // |: 1 2 3 4 :|
  'repeat-all': { bars: [S, plain, plain, E], ask: { bar: 3, time: 1 } },
  // 1 |: 2 3 :| 4
  'repeat-inner': { bars: [plain, S, E, plain], ask: { bar: 2, time: 1 } },
  // 1 2 3 :| 4: no begin repeat, so back to the start.
  'repeat-from-start': { bars: [plain, plain, E, plain], ask: { bar: 2, time: 1 } },
  // 1 2 |: 3 4 :|
  'repeat-tail': { bars: [plain, plain, S, E], ask: { bar: 3, time: 1 } },
  // |: 1 2 :||: 3 4 :|
  'repeat-twice': { bars: [S, E, S, E], ask: { bar: 3, time: 1 } },
  // |: 1 2 3 [1. 4 :|] [2. 5]
  endings: {
    bars: [S, plain, plain, { ending: 1, ...E }, { ending: 2 }],
    ask: { bar: 2, time: 2 },
  },
  // 1 2 3 [1. 4 :|] [2. 5]: back to the start after the 1st ending.
  'endings-from-start': {
    bars: [plain, plain, plain, { ending: 1, ...E }, { ending: 2 }],
    ask: { bar: 3, time: 1 },
  },
  // 1 |: 2 3 [1. 4 :|] [2. 5] 6
  'endings-inner': {
    bars: [plain, S, plain, { ending: 1, ...E }, { ending: 2 }, plain],
    ask: { bar: 2, time: 2 },
  },
  // |: 1 2 [1. 3 4 :|] [2. 5 6]
  'endings-long': {
    bars: [S, plain, { ending: 1 }, { ending: 1, ...E }, { ending: 2 }, { ending: 2 }],
    ask: { bar: 1, time: 2 },
  },
};

/**
 * The order the bars are played in (indices). An end repeat sends the
 * player back once, to the last begin repeat or, with none, to the start.
 * The second time through, a 1st ending is skipped. Past an end repeat that
 * has been taken, a later repeat goes back no further than the bar after it.
 */
export function playOrder(bars: readonly FormMarks[]): number[] {
  const order: number[] = [];
  const taken = new Set<number>();
  let from = 0;
  let secondTime = false;
  for (let i = 0; i < bars.length;) {
    const bar = bars[i] as FormMarks;
    if (bar.repeatStart) from = i;
    if (bar.ending === 1 && secondTime) {
      i++;
      continue;
    }
    order.push(i);
    if (bar.repeatEnd && !taken.has(i)) {
      taken.add(i);
      i = from;
      secondTime = true;
      continue;
    }
    if (bar.repeatEnd || bar.ending === 2) {
      secondTime = false;
      from = i + 1;
    }
    i++;
  }
  return order;
}

/** The bar played after the `time`-th play of `bar`, or null at the end. */
export function nextBar(order: readonly number[], bar: number, time: 1 | 2): number | null {
  let seen = 0;
  for (let i = 0; i < order.length; i++) {
    if (order[i] === bar && ++seen === time) return order[i + 1] ?? null;
  }
  return null;
}

/**
 * The begin repeat an end repeat goes back to: the last one at or before it,
 * since the previous end repeat. Null when there is none.
 */
export function repeatStartFor(bars: readonly FormMarks[], end: number): number | null {
  for (let i = end; i >= 0; i--) {
    if (bars[i]?.repeatStart) return i;
    if (i < end && bars[i]?.repeatEnd) return null;
  }
  return null;
}

/** The bars under an ending bracket, as indices. */
export function endingBars(bars: readonly FormMarks[], ending: 1 | 2): number[] {
  return bars.flatMap((b, i) => (b.ending === ending ? [i] : []));
}
