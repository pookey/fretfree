import { meterEarItemId } from '../items/meter-ear';
import type { Skill } from '../model';
import { itemsOf, memo } from './helpers';
import { T4_DRILLS } from './t4';

/**
 * T7: odd meters (research/03: "5/4 and 7/8 as groupings (3+2, 2+2+3)";
 * "identify 5/4 and 7/8 by ear"). The advanced end of the meter track, so
 * it waits for the common meters to be mastered, not merely practised
 * (research/02 rule 7).
 *
 * D30 plays each in more than one grouping (5/4 as 3+2 or 2+3, 7/8 as
 * 2+2+3, 3+2+2 or 2+3+2), so a card is the meter, not one pattern
 * (rule 12); the feedback names the grouping heard. Tapping the grouping
 * belongs to the strumming drill (D31), not this one.
 */
export const skills: Skill[] = [
  {
    id: 'T7.odd',
    topic: 'T7',
    order: 2870,
    title: 'Hear odd meters: 5/4 and 7/8',
    prerequisites: ['T4.compound'],
    skipPlacement: true,
    drillTypes: T4_DRILLS,
    items: memo(() => itemsOf('T7.odd', (['5/4', '7/8'] as const).map(meterEarItemId))),
  },
];
