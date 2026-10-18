import { counts, dailyQuest } from './helpers';
import type { QuestTemplate } from './types';

/**
 * Clear every due review. Due reviews are the spacing that makes notes stick
 * (research/02 rule 1). Drawn once there is history to come due. With nothing
 * due, any practice that is not a stable card drilled early clears it.
 */
const clearDue: QuestTemplate = {
  id: 'clear-due',
  draw: (snapshot) =>
    snapshot.priorReviews.length === 0
      ? null
      : dailyQuest('clear-due', {
          title: 'Clear your due reviews',
          description: 'Answer every review that comes due today. Spaced reviews make notes stick.',
          progress: (ctx) => (ctx.dueRemaining === 0 && ctx.answers.some(counts) ? 1 : 0),
        }),
};

export default clearDue;
