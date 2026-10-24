import { formItemId, pickupItemId, type FormShape } from '../items/form';
import type { Skill } from '../model';
import { itemsOf, memo } from './helpers';

/**
 * T6: pickups, repeats and first and second endings (research/03 track T:
 * "find bar 1 of a pickup melody; follow repeat signs"). The form-reading
 * drill draws a short tune on a rhythm staff, fresh every prompt (research/02
 * rule 12), and plays it in the order it is read once the learner has
 * answered (rule 10).
 *
 * - Pickups: tap a bar counted from bar 1, the first full bar, and say which
 *   beat the pickup starts on, so the tune can be counted in. 4/4 and 3/4
 *   first; 6/8 waits for compound meter (T2), as its pickups are counted in
 *   eighths.
 * - Repeats: which bar follows an end repeat, and every bar in the order it
 *   is played. An end repeat with no begin repeat goes back to the start:
 *   that and the begin repeat partway in are the classic confusion, so both
 *   are cards of one skill (rule 6).
 * - Endings: the 1st ending the first time, the 2nd the second time. They
 *   build on repeats (rule 7).
 *
 * Reading a form is practice, not something to place out of: no placement,
 * as for the rest of the meter track.
 */

export const T6_DRILLS = ['form-reading'];

/** Pickups as `<meter>:<beats>`, the beats counted in the bottom number's note. */
export const T6_SIMPLE_PICKUPS: readonly string[] = ['4/4:1', '3/4:1', '4/4:2', '3/4:2', '4/4:3'];
export const T6_COMPOUND_PICKUPS: readonly string[] = ['6/8:1', '6/8:3'];

export const T6_REPEATS: readonly FormShape[] = [
  'repeat-all',
  'repeat-inner',
  'repeat-from-start',
  'repeat-tail',
  'repeat-twice',
];
export const T6_ENDINGS: readonly FormShape[] = [
  'endings',
  'endings-from-start',
  'endings-inner',
  'endings-long',
];

const pickups = (list: readonly string[]) =>
  list.flatMap((p) => {
    const [meter, beats] = p.split(':') as [string, string];
    return [pickupItemId(meter, Number(beats), 'bar'), pickupItemId(meter, Number(beats), 'start')];
  });

const roadMaps = (shapes: readonly FormShape[]) =>
  shapes.flatMap((s) => [formItemId(s, 'next'), formItemId(s, 'order')]);

interface Group {
  id: string;
  title: string;
  prerequisites: readonly string[];
  order: number;
  ids: () => string[];
}

// Skill IDs are written out: e2e/helpers/skills.ts reads them from this file.
const GROUPS: readonly Group[] = [
  {
    id: 'T6.pickups',
    title: 'Pickups: find bar 1',
    // Counting a pickup's beats needs the time signature read first.
    prerequisites: ['T1.simple-meters'],
    // After T5's strumming (2860), before T7 (2870).
    order: 2862,
    ids: () => pickups(T6_SIMPLE_PICKUPS),
  },
  {
    id: 'T6.repeats',
    title: 'Follow repeat signs',
    prerequisites: ['T1.simple-meters'],
    order: 2864,
    ids: () => roadMaps(T6_REPEATS),
  },
  {
    id: 'T6.endings',
    title: 'First and second endings',
    prerequisites: ['T6.repeats'],
    order: 2866,
    ids: () => roadMaps(T6_ENDINGS),
  },
  {
    id: 'T6.pickups-compound',
    title: 'Pickups in 6/8',
    prerequisites: ['T6.pickups', 'T2.compound-meters'],
    order: 2868,
    ids: () => pickups(T6_COMPOUND_PICKUPS),
  },
];

export const skills: Skill[] = GROUPS.map((g) => ({
  id: g.id,
  topic: 'T6',
  order: g.order,
  title: g.title,
  prerequisites: g.prerequisites,
  softUnlock: true,
  skipPlacement: true,
  drillTypes: T6_DRILLS,
  items: memo(() => itemsOf(g.id, g.ids())),
}));
