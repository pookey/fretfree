import { ENGINE_CONFIG } from '../../config';
import { distinctItems, everydayQuest, fluent } from './helpers';

const { target } = ENGINE_CONFIG.quests.fluent;

/**
 * Fluent recall on different items: right and quick, without a hint
 * (research/02 rules 2–3). Each item counts once, so repeating one can't
 * finish it.
 */
export default everydayQuest('fluent', {
  title: `Recall ${target} items fluently`,
  description: 'Right and quick, without a hint. Each item counts once.',
  progress: (ctx) => distinctItems(ctx.answers.filter(fluent)),
});
