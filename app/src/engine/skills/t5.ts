import { accentItemId, type AccentPattern } from '../items/accent';
import type { Skill } from '../model';
import { itemsOf, memo } from './helpers';
import { T3_DRILLS } from './t3';

/**
 * T5: accent patterns per meter (research/03: "strumming and accent patterns
 * per meter; where the downbeat falls"; "strum or tap with the correct accent
 * pattern against a click"). D31 plays the click and the learner taps or
 * strums the bar, the accented strokes strong and the rest soft.
 *
 * The click fades out as the taps stay in time (design §12, guidance
 * hypothesis): a dropped click is still graded, so the learner has to carry
 * the bar, and where its downbeat falls, in their head.
 *
 * The downbeat comes first, in 4/4, 3/4 and 2/4, then the backbeat (2 and 4,
 * and the 12/8 shuffle's), then strumming patterns with their accents once
 * F4 has taught the down-up strum. Odd meters accent their grouping (3+2,
 * 2+2+3): T7 hears them, and D30 left tapping the grouping to D31. Every
 * skill opens once its prerequisites are practising, and none is placed out
 * of.
 */

interface Group {
  id: string;
  title: string;
  prerequisites: readonly string[];
  order: number;
  patterns: readonly AccentPattern[];
}

// Skill IDs are written out: e2e/helpers/skills.ts reads them from this file.
const GROUPS: readonly Group[] = [
  {
    id: 'T5.downbeat',
    title: 'Find the downbeat: accent beat 1',
    prerequisites: ['F4.pulse'],
    // After T4 (2840s), before T7 (2870).
    order: 2850,
    patterns: ['4/4:downbeat', '3/4:downbeat', '2/4:downbeat'],
  },
  {
    id: 'T5.backbeat',
    title: 'The backbeat: accent 2 and 4',
    prerequisites: ['T5.downbeat'],
    order: 2855,
    patterns: ['4/4:backbeat', '12/8:backbeat'],
  },
  {
    id: 'T5.strumming',
    title: 'Strum with accents: rock, waltz and 6/8',
    prerequisites: ['T5.backbeat', 'F4.strumming'],
    order: 2860,
    patterns: ['4/4:rock-strum', '3/4:waltz-strum', '6/8:strum'],
  },
  {
    id: 'T5.odd',
    title: 'Accent the grouping: 5/4 and 7/8',
    prerequisites: ['T5.downbeat', 'T7.odd'],
    order: 2880,
    patterns: ['5/4:grouping', '7/8:grouping'],
  },
];

export const skills: Skill[] = GROUPS.map((g) => ({
  id: g.id,
  topic: 'T5',
  order: g.order,
  title: g.title,
  prerequisites: g.prerequisites,
  softUnlock: true,
  skipPlacement: true,
  drillTypes: T3_DRILLS,
  items: memo(() => itemsOf(g.id, g.patterns.map(accentItemId))),
}));
