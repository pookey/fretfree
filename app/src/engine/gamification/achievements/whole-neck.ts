import { C2_STAGE_IDS } from '../../skills/c2';
import { masteryAchievement } from './helpers';

export default masteryAchievement({
  id: 'whole-neck',
  title: 'Whole neck',
  description: 'You know every note on every string, sharps and flats included, to fret 12.',
  order: 30,
  // F2's strings 6 and 5 (only practising gates on C2), then every C2 stage (M10-12).
  skillId: ['F2.string6-naturals', 'F2.string5-naturals', ...C2_STAGE_IDS],
});
