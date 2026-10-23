import { meterEarItemId, type EarMeter } from '../items/meter-ear';
import type { Skill } from '../model';
import { itemsOf, memo } from './helpers';

/**
 * T4: common meters by feel (research/03: "4/4 rock and pop, 3/4 waltz, 6/8
 * and 12/8 ballad and blues shuffle"; "identify the meter by ear from a clip
 * or strummed pattern"). D30 plays a strummed or drummed clip and the
 * learner names its meter.
 *
 * **Sound before symbol** (design §12, Gordon, Kodály): the clip comes
 * first and the answers are meter names. The notation and the counting
 * appear only once the learner has answered, so T4 waits for no reading
 * skill (T1, T2): hearing a meter comes before reading one.
 *
 * Simple meters come first (count three or four beats), then compound ones
 * (each beat split in three). D30's wider scopes and the session's seed
 * confusions (`engine/confusions.ts`) mix 6/8 with 3/4 and 12/8 with 4/4
 * (research/02 rule 6).
 *
 * The Meter module opens after Rhythm (`engine/frontier.ts`), so T4 opens
 * once the pulse (F4) is being practised. Like F4, it is practice rather
 * than a gate, and the placement test has no clip: it skips placement.
 */

export const T4_DRILLS = ['hear-the-meter'];

interface Group {
  id: string;
  title: string;
  prerequisites: readonly string[];
  meters: readonly EarMeter[];
}

// Skill IDs are written out: e2e/helpers/skills.ts reads them from this file.
const GROUPS: readonly Group[] = [
  {
    id: 'T4.simple',
    title: 'Hear the meter: 4/4 or 3/4',
    prerequisites: ['F4.pulse'],
    meters: ['4/4', '3/4'],
  },
  {
    id: 'T4.compound',
    title: 'Hear the meter: 6/8 and 12/8, beats in three',
    prerequisites: ['T4.simple'],
    meters: ['6/8', '12/8'],
  },
];

export const skills: Skill[] = GROUPS.map((g, i) => ({
  id: g.id,
  topic: 'T4',
  // The Meter module, after Tab (2700s); T1–T3 have the orders before it.
  order: 2840 + i,
  title: g.title,
  prerequisites: g.prerequisites,
  softUnlock: true,
  skipPlacement: true,
  drillTypes: T4_DRILLS,
  items: memo(() => itemsOf(g.id, g.meters.map(meterEarItemId))),
}));
