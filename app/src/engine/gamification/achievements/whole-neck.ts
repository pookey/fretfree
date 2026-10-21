import { C2_STAGE_IDS } from '../../skills/c2';
import { masteryAchievement } from './helpers';

export default masteryAchievement({
  id: 'whole-neck',
  title: 'Whole neck',
  description: 'You know every note on every string, sharps and flats included, to fret 12.',
  order: 30,
  // Every C2 stage (M10-12); F2's strings 6 and 5 are their prerequisites.
  skillId: C2_STAGE_IDS,
});
