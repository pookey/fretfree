import { ENGINE_CONFIG } from '../../config';
import { distinctItems, everydayQuest, recalled } from './helpers';

const { target } = ENGINE_CONFIG.quests['new-ground'];

/**
 * Learn new items: met for the first time today, then recalled without a
 * hint. A worked example alone doesn't count (research/02 rule 8).
 */
export default everydayQuest('new-ground', {
  title: `Learn ${target} new items`,
  description: 'Meet each one with a worked example, then recall it on your own.',
  progress: (ctx) => {
    const met = new Set(ctx.answers.filter((a) => a.kind === 'new').map((a) => a.itemId));
    return distinctItems(ctx.answers.filter((a) => recalled(a) && met.has(a.itemId)));
  },
});
