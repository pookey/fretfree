import { INLAY_FRETS } from '../../theory';
import { tabItemId } from '../items/tab';
import type { Skill } from '../model';
import { FRETS_0_12, itemsOf, memo } from './helpers';

/**
 * TAB: reading tab, one note at a time (docs/design/tab-track.md §4). An item
 * such as `tab@s3f5` asks for the note on tab line 3 at fret 5, tapped on the
 * neck (D33). There is one card per cell, strings 1–6 at frets 0–12: the
 * track trains reading a line and a number as a place, at speed, and each
 * cell's speed is its own (research/02 rules 1–3).
 *
 * The strings come in one at a time, outer lines first, because the top and
 * bottom lines are the easiest to find: 1, 6, then 2 and 5, then 3 and 4.
 * Each string's skill soft-unlocks the next once it is practising, so its
 * items are blocked briefly as they arrive and then interleave with every
 * string already met (rule 6). The order brings each confusable neighbour in
 * after the line next to it (2 before 3, 5 before 4), and the two E lines
 * come first so they are told apart from the start; D33's confusion keys
 * pair them in sessions (`engine/confusions.ts`).
 *
 * The track is optional and stays out of the placement test: a learner who
 * already reads tab tests out with the track's own probe (M9-05).
 */

export const TAB_DRILLS = ['tab-to-neck'];

/** The order strings are introduced in: the outer lines first. */
export const TAB_STRING_ORDER: readonly number[] = [1, 6, 2, 5, 3, 4];

/**
 * Frets in the order a string's cells are introduced: the open string and the
 * inlay landmarks first, as anchors, then the frets between them.
 */
export const TAB_FRET_ORDER: readonly number[] = (() => {
  const anchors = [0, ...INLAY_FRETS.filter((f) => f <= 12)];
  return [...anchors, ...FRETS_0_12.filter((f) => !anchors.includes(f))];
})();

const NAMES: Readonly<Record<number, string>> = {
  1: 'the top line (string 1, high e)',
  2: 'line 2 (string 2, B)',
  3: 'line 3 (string 3, G)',
  4: 'line 4 (string 4, D)',
  5: 'line 5 (string 5, A)',
  6: 'the bottom line (string 6, low E)',
};

export const skills: Skill[] = TAB_STRING_ORDER.map((string, i): Skill => {
  const id = `TAB.string${string}`;
  const prev = TAB_STRING_ORDER[i - 1];
  return {
    id,
    topic: 'TAB',
    order: 2700 + i * 10,
    title: `Read tab on ${NAMES[string]}`,
    // Finding fret 7 on the neck builds on the fret landmarks (F3).
    prerequisites: prev === undefined ? ['F3.markers'] : [`TAB.string${prev}`],
    softUnlock: true,
    skipPlacement: true,
    drillTypes: TAB_DRILLS,
    items: memo(() =>
      itemsOf(
        id,
        TAB_FRET_ORDER.map((fret) => tabItemId({ string, fret })),
      ),
    ),
  };
});
