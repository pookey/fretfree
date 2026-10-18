import { ENGINE_CONFIG } from '../../config';
import { counts, everydayQuest, recalled } from './helpers';

const { target } = ENGINE_CONFIG.quests['fix-slips'];

/**
 * Turn misses into hits: an item answered wrong, then recalled when it comes
 * back. Errors are part of learning (design §3.7: nothing punishes mistakes),
 * and retrieval after feedback is what fixes them.
 */
export default everydayQuest('fix-slips', {
  title: `Fix ${target} slips`,
  description: 'Missed one? Get it right when it comes back. Mistakes are how you learn.',
  progress: (ctx) => {
    const missed = new Set<string>();
    const fixed = new Set<string>();
    for (const a of ctx.answers) {
      if (!counts(a)) continue;
      if (!a.correct) missed.add(a.itemId);
      else if (recalled(a) && missed.has(a.itemId)) fixed.add(a.itemId);
    }
    return fixed.size;
  },
});
