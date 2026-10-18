import {
  ENGINE_CONFIG,
  deriveStatus,
  isFrontier,
  type CardRecord,
  type Goal,
  type Item,
  type Skill,
  type SkillStatus,
} from '../../engine';
import { moduleOfTopic, orderModules, type Module } from '../../engine/frontier';
import { progressBySkill } from '../../engine/progress';

/**
 * The Learn map's view model (design §7 Learn, §5): every module with its
 * skills, a two-layer ring value (learning under stable, `engine/progress`)
 * and a derived state. Pure, so the screen only loads data and renders.
 */

/** `soon`: the module's skills aren't built yet; it can still be previewed. */
export type ModuleState = 'mastered' | 'open' | 'locked' | 'soon';

export interface SkillView {
  skill: Skill;
  status: SkillStatus;
  itemCount: number;
  /** Items whose latest review was correct, or that are stable. */
  learningCount: number;
  /** Items whose FSRS stability has reached the mastery threshold. */
  stableCount: number;
  /** 0–1: the ring's light layer, never below `mastery`. A mastered skill is full. */
  learning: number;
  /** 0–1: the ring's solid, stable layer. A mastered skill is full. */
  mastery: number;
  /** A built drill can test at least one of its items, so a session can serve it. */
  practisable: boolean;
}

export interface ModuleView {
  module: Module;
  skills: SkillView[];
  state: ModuleState;
  /** 0–1, weighted by item count. */
  learning: number;
  /** 0–1, weighted by item count. */
  mastery: number;
  masteredSkills: number;
}

export interface MapInput {
  skills: readonly Skill[];
  goal: Goal;
  /** Stored skill statuses; missing ones are derived from prerequisites. */
  stored: ReadonlyMap<string, SkillStatus>;
  cards: readonly CardRecord[];
  /** Each item's latest review, true when correct (`latestOutcomes`). */
  outcomes?: ReadonlyMap<string, boolean>;
  modules?: readonly Module[];
  stabilityDays?: number;
  /** Whether a built drill can test an item (the session's drill picker). Defaults to yes. */
  canServe?: (item: Item) => boolean;
}

/**
 * Every skill's status as the session runner derives it, in registry order
 * so prerequisites resolve first. Locked skills stay previewable (§3.4).
 */
export function skillStatuses(
  skills: readonly Skill[],
  stored: ReadonlyMap<string, SkillStatus>,
): Map<string, SkillStatus> {
  const statuses = new Map(stored);
  for (const skill of skills)
    statuses.set(skill.id, deriveStatus(skill, statuses, stored.get(skill.id)));
  return statuses;
}

function moduleState(skills: readonly SkillView[]): ModuleState {
  if (skills.length === 0) return 'soon';
  if (skills.every((s) => s.status === 'mastered')) return 'mastered';
  return skills.some((s) => isFrontier(s.status)) ? 'open' : 'locked';
}

export function buildMap(input: MapInput): ModuleView[] {
  const stabilityDays = input.stabilityDays ?? ENGINE_CONFIG.mastery.stabilityDays;
  const statuses = skillStatuses(input.skills, input.stored);
  const progress = progressBySkill(input.cards, input.outcomes ?? new Map(), stabilityDays);
  const byModule = new Map<string, SkillView[]>();
  for (const skill of input.skills) {
    const moduleId = moduleOfTopic(skill.topic)?.id;
    if (!moduleId) continue;
    const status = statuses.get(skill.id) as SkillStatus;
    const items = skill.items();
    const itemCount = items.length;
    const practisable = items.some(input.canServe ?? (() => true));
    const p = progress.get(skill.id);
    const learningCount = Math.min(itemCount, p?.learning ?? 0);
    const stableCount = Math.min(itemCount, p?.stable ?? 0);
    const share = (n: number) => (status === 'mastered' ? 1 : itemCount === 0 ? 0 : n / itemCount);
    const list = byModule.get(moduleId) ?? [];
    list.push({
      skill,
      status,
      itemCount,
      learningCount,
      stableCount,
      learning: share(learningCount),
      mastery: share(stableCount),
      practisable,
    });
    byModule.set(moduleId, list);
  }
  return orderModules(input.goal, input.modules).map((module) => {
    const skills = byModule.get(module.id) ?? [];
    const items = skills.reduce((n, s) => n + s.itemCount, 0);
    const weighted = (of: (s: SkillView) => number) =>
      items === 0 ? 0 : skills.reduce((n, s) => n + of(s) * s.itemCount, 0) / items;
    return {
      module,
      skills,
      state: moduleState(skills),
      learning: weighted((s) => s.learning),
      mastery: weighted((s) => s.mastery),
      masteredSkills: skills.filter((s) => s.status === 'mastered').length,
    };
  });
}

/**
 * The module shown when none is picked: the first open one in goal order,
 * else the first with skills, else the first.
 */
export function defaultModule(map: readonly ModuleView[]): ModuleView | undefined {
  return map.find((m) => m.state === 'open') ?? map.find((m) => m.state !== 'soon') ?? map[0];
}

export const MODULE_STATE_LABEL: Readonly<Record<ModuleState, string>> = {
  open: 'In progress',
  mastered: 'Mastered',
  locked: 'Locked: preview',
  soon: 'Coming soon',
};

export const SKILL_STATUS_LABEL: Readonly<Record<SkillStatus, string>> = {
  locked: 'Locked: preview',
  unlocked: 'Ready',
  practising: 'Practising',
  mastered: 'Mastered',
};

/**
 * A 0–1 fraction as a whole, clamped percentage. Any progress shows as at
 * least 1%, so one item in a large skill doesn't read as none.
 */
export function percent(fraction: number): number {
  const pct = Math.round(Math.max(0, Math.min(1, fraction)) * 100);
  return fraction > 0 ? Math.max(1, pct) : pct;
}

/** A skill's ring state: its status in the module states' terms. */
export function skillRingState(status: SkillStatus): ModuleState {
  if (status === 'mastered') return 'mastered';
  return status === 'locked' ? 'locked' : 'open';
}
