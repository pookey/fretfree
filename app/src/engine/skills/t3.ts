import { countItemId, type CountPattern } from '../items/accent';
import type { Skill } from '../model';
import { itemsOf, memo } from './helpers';

/**
 * T3: counting systems (research/03: "'1 e & a' for simple time and '1 la
 * li' for compound"; "count a bar aloud in time (tap-along check)"). D31
 * plays a click and the learner taps every syllable of the count, the beat
 * numbers accented, so the check is both the subdivision in time and
 * knowing which syllable is a beat. The syllables show under the bar at
 * high guide levels and fade (research/02 rule 9); the click fades too, as
 * the taps stay in time.
 *
 * Eighths ("1 & 2 &") are F4's (D20), so T3 starts at sixteenths and
 * triplets. Compound time's "1 la li" waits for hearing 6/8 and 12/8 (T4):
 * sound before symbol (design §12). 4/4 in triplets and 12/8 count the same
 * bar, so the session's seed confusion `meter:4/4`–`meter:12/8` mixes them
 * (rule 6). Timing is practice, not something to place out of: no
 * placement.
 */

export const T3_DRILLS = ['accent-strum'];

interface Group {
  id: string;
  title: string;
  prerequisites: readonly string[];
  order: number;
  patterns: readonly CountPattern[];
}

// Skill IDs are written out: e2e/helpers/skills.ts reads them from this file.
const GROUPS: readonly Group[] = [
  {
    id: 'T3.simple',
    title: 'Count it: “1 e & a” and “1 trip let”',
    prerequisites: ['F4.eighths'],
    // The Meter module, after T2 and Tab; T4 (2840s) is the next topic.
    order: 2800,
    patterns: ['2/4:4', '4/4:4', '4/4:3'],
  },
  {
    id: 'T3.compound',
    title: 'Count compound time: “1 la li”',
    prerequisites: ['T3.simple', 'T4.compound'],
    order: 2846,
    patterns: ['6/8:3', '9/8:3', '12/8:3'],
  },
];

export const skills: Skill[] = GROUPS.map((g) => ({
  id: g.id,
  topic: 'T3',
  order: g.order,
  title: g.title,
  prerequisites: g.prerequisites,
  softUnlock: true,
  skipPlacement: true,
  drillTypes: T3_DRILLS,
  items: memo(() => itemsOf(g.id, g.patterns.map(countItemId))),
}));
