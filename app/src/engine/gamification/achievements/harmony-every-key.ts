import { SKILLS } from '../../skills';
import { masteryAchievement } from './helpers';

/** The harmony module (C8) mastered: every key stage, in Roman numerals and Nashville numbers. */
export default masteryAchievement({
  id: 'harmony-every-key',
  title: 'Harmony in every key',
  description: 'You know the chords of every major key, by Roman numeral and by Nashville number.',
  order: 62,
  skillId: SKILLS.filter((s) => s.topic === 'C8').map((s) => s.id),
});
