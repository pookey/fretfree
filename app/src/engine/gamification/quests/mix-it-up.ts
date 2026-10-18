import { ENGINE_CONFIG } from '../../config';
import { dailyQuest, recalled } from './helpers';
import type { QuestTemplate } from './types';

const { target } = ENGINE_CONFIG.quests['mix-it-up'];

/**
 * Interleave: recall something from several skills in one day (research/02
 * rule 6). Drawn once the learner has practised that many skills before.
 */
const mixItUp: QuestTemplate = {
  id: 'mix-it-up',
  draw: (snapshot) =>
    new Set(snapshot.priorReviews.map((r) => r.skillId)).size < target
      ? null
      : dailyQuest('mix-it-up', {
          title: `Mix ${target} skills`,
          description:
            'Get answers right in different skills. Mixing feels harder, and sticks better.',
          progress: (ctx) => new Set(ctx.answers.filter(recalled).map((a) => a.skillId)).size,
        }),
};

export default mixItUp;
