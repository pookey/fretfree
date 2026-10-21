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

/**
 * Frets in the order a string's cells are introduced: the open string and the
 * inlay landmarks first, as anchors, then the frets between them.
 */
export const TAB_FRET_ORDER: readonly number[] = (() => {
  const anchors = [0, ...INLAY_FRETS.filter((f) => f <= 12)];
  return [...anchors, ...FRETS_0_12.filter((f) => !anchors.includes(f))];
})();

/**
 * One skill per string, in the order they are introduced: the outer lines
 * first. IDs are literals, which e2e seeds read from this file.
 */
const STRINGS = [
  { id: 'TAB.string1', string: 1, line: 'the top line (string 1, high e)' },
  { id: 'TAB.string6', string: 6, line: 'the bottom line (string 6, low E)' },
  { id: 'TAB.string2', string: 2, line: 'line 2 (string 2, B)' },
  { id: 'TAB.string5', string: 5, line: 'line 5 (string 5, A)' },
  { id: 'TAB.string3', string: 3, line: 'line 3 (string 3, G)' },
  { id: 'TAB.string4', string: 4, line: 'line 4 (string 4, D)' },
] as const;

export const TAB_STRING_ORDER: readonly number[] = STRINGS.map((s) => s.string);

export const skills: Skill[] = STRINGS.map(({ id, string, line }, i): Skill => {
  const prev = STRINGS[i - 1];
  return {
    id,
    topic: 'TAB',
    order: 2700 + i * 10,
    title: `Read tab on ${line}`,
    // Finding fret 7 on the neck builds on the fret landmarks (F3).
    prerequisites: prev ? [prev.id] : ['F3.markers'],
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
