import { SKILLS } from '../../skills';
import { masteryAchievement } from './helpers';

/** The progressions module (C9) mastered: pop, ii–V–I, the blues and minor keys. */
export default masteryAchievement({
  id: 'progressions-all',
  title: 'Every progression',
  description:
    'You can build every progression in the course, from pop and rock to ii–V–I and the blues, in any key.',
  order: 64,
  skillId: SKILLS.filter((s) => s.topic === 'C9').map((s) => s.id),
});
