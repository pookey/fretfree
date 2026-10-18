import { ENGINE_CONFIG } from '../../config';
import { getSkill } from '../../skills';
import {
  accuracy,
  areaStats,
  dailyQuest,
  fluentShare,
  recalled,
  weakestAreas,
  type AreaStats,
} from './helpers';
import type { QuestSnapshot, QuestTemplate } from './types';

const { target } = ENGINE_CONFIG.quests['weak-skill'];

/** Least accurate first, then least fluent, then by id. */
function weaker([a, sa]: [string, AreaStats], [b, sb]: [string, AreaStats]): number {
  return accuracy(sa) - accuracy(sb) || fluentShare(sa) - fluentShare(sb) || a.localeCompare(b);
}

/** The learner's least accurate skill before the date, or `null` with fewer than two judged. */
export function weakSkill(snapshot: QuestSnapshot): string | null {
  const ranked = weakestAreas(
    areaStats(snapshot.priorReviews, (r) => [r.skillId]),
    weaker,
  );
  return ranked.length < 2 ? null : (ranked[0]?.[0] ?? null);
}

/**
 * Correct, unguided answers in the learner's shakiest skill. The skill comes
 * from earlier days, so it stays the same all day.
 */
const weakSkillQuest: QuestTemplate = {
  id: 'weak-skill',
  draw: (snapshot) => {
    const skillId = weakSkill(snapshot);
    if (!skillId) return null;
    return dailyQuest('weak-skill', {
      id: `weak-skill:${skillId}`,
      title: `Get ${target} right: ${getSkill(skillId)?.title ?? skillId}`,
      description: 'Your shakiest skill lately. A little extra recall here goes a long way.',
      progress: (ctx) => ctx.answers.filter((a) => recalled(a) && a.skillId === skillId).length,
    });
  },
};

export default weakSkillQuest;
