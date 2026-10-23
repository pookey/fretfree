import { SKILLS } from '../../skills';
import { masteryAchievement } from './helpers';

/** The CAGED module (C6) mastered: cores and whole shapes, major, minor and dominant 7. */
export default masteryAchievement({
  id: 'caged-shapes',
  title: 'CAGED map',
  description: 'You know all five CAGED shapes, major, minor and 7, and can place them in any key.',
  order: 61,
  skillId: SKILLS.filter((s) => s.topic === 'C6').map((s) => s.id),
});
