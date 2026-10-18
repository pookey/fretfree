import { ENGINE_CONFIG } from '../../config';
import {
  accuracy,
  areaStats,
  dailyQuest,
  fluent,
  fluentShare,
  stringsOf,
  weakestAreas,
  type AreaStats,
} from './helpers';
import type { QuestSnapshot, QuestTemplate } from './types';

const { target } = ENGINE_CONFIG.quests['weak-strings'];

/** Least fluent first, then least accurate, then the lower string number. */
function weaker([a, sa]: [number, AreaStats], [b, sb]: [number, AreaStats]): number {
  return fluentShare(sa) - fluentShare(sb) || accuracy(sa) - accuracy(sb) || a - b;
}

/**
 * The learner's weakest strings before the date: the least fluent string, and
 * its weaker judged neighbour when at least three strings are judged (so the
 * pair never covers everything they play). `null` with fewer than two judged
 * strings: there is nothing to compare.
 */
export function weakStrings(snapshot: QuestSnapshot): number[] | null {
  const ranked = weakestAreas(
    areaStats(snapshot.priorReviews, (r) => stringsOf(r.itemId)),
    weaker,
  );
  const weakest = ranked[0]?.[0];
  if (weakest === undefined || ranked.length < 2) return null;
  const partner =
    ranked.length >= 3 ? ranked.find(([s]) => Math.abs(s - weakest) === 1)?.[0] : undefined;
  return partner === undefined ? [weakest] : [weakest, partner].sort((a, b) => a - b);
}

/**
 * Fluent answers on the learner's weakest strings (design §3.7: "10 fluent
 * answers on strings 3–4"). The strings come from earlier days, so they stay
 * the same all day.
 */
const weakStringsQuest: QuestTemplate = {
  id: 'weak-strings',
  draw: (snapshot) => {
    const strings = weakStrings(snapshot);
    if (!strings) return null;
    const label = strings.length === 1 ? `string ${strings[0]}` : `strings ${strings.join('–')}`;
    return dailyQuest('weak-strings', {
      id: `weak-strings:${strings.join('-')}`,
      title: `${target} fluent answers on ${label}`,
      description: `Your slowest ${strings.length === 1 ? 'string' : 'strings'} lately. Fluent means right and quick, without a hint.`,
      progress: (ctx) =>
        ctx.answers.filter((a) => fluent(a) && stringsOf(a.itemId).some((s) => strings.includes(s)))
          .length,
    });
  },
};

export default weakStringsQuest;
