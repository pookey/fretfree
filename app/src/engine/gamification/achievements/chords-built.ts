import { SKILLS } from '../../skills';
import { masteryAchievement } from './helpers';

/** The chords module (C5) mastered whole: every stage, so no stage left half-learned. */
export default masteryAchievement({
  id: 'chords-built',
  title: 'Chord builder',
  description:
    'You know every chord in the course inside out: spelled, named, built and found on the neck.',
  order: 60,
  skillId: SKILLS.filter((s) => s.topic === 'C5').map((s) => s.id),
});
