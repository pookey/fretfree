import { masteryAchievement } from './helpers';

/**
 * The first song-ready progressions: C9's pop and rock stage (I–IV–V,
 * I–V–vi–IV and their rotations), built and moved to other keys.
 */
export default masteryAchievement({
  id: 'progressions-song-ready',
  title: 'Song-ready',
  description:
    'You can build the progressions behind countless songs, like I–IV–V and I–V–vi–IV, in any key.',
  order: 63,
  skillId: 'C9.pop',
});
