import type { AnyDrillType } from '../drills/types';
import { moduleOfTopic } from '../engine/frontier';
import type { Skill } from '../engine/model';
import { createDrillPicker } from '../session/drill-picker';
import { placementGroups } from './algorithm';

/**
 * The module titles a placement test probes today, in curriculum order: every
 * configured topic that has skills and a drill to test them. Topics join as
 * their skills land, which is why a learner may want to take the test again.
 */
export function probedModules(skills: readonly Skill[], drills: readonly AnyDrillType[]): string[] {
  const picker = createDrillPicker(skills, drills);
  const topics = placementGroups(skills, (i) => picker.canServe(i)).map(
    (g) => skills.find((s) => s.id === g.id)?.topic,
  );
  const titles = topics.flatMap((t) => (t ? (moduleOfTopic(t)?.title ?? []) : []));
  return [...new Set(titles)];
}

/** "a", "a and b", "a, b and c". */
export function listOf(words: readonly string[]): string {
  if (words.length <= 1) return words.join('');
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}
