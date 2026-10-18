import {
  ENGINE_CONFIG,
  deriveStatus,
  isFrontier,
  type CardRecord,
  type Goal,
  type Skill,
  type SkillStatus,
} from '../../engine';
import { moduleOfTopic, orderModules, type Module } from '../../engine/frontier';

/**
 * The Learn map's view model (design §7 Learn, §5): every module with its
 * skills, a mastery ring value and a derived state. Pure, so the screen only
 * loads data and renders.
 */

/** `soon`: the module's skills aren't built yet; it can still be previewed. */
export type ModuleState = 'mastered' | 'open' | 'locked' | 'soon';

export interface SkillView {
  skill: Skill;
  status: SkillStatus;
  itemCount: number;
  /** Items whose FSRS stability has reached the mastery threshold. */
  stableCount: number;
  /** 0–1: the ring value. A mastered skill is full. */
  mastery: number;
}

export interface ModuleView {
  module: Module;
  skills: SkillView[];
  state: ModuleState;
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
  modules?: readonly Module[];
  stabilityDays?: number;
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
  const stable = new Map<string, number>();
  for (const c of input.cards) {
    if (c.fsrs.stability >= stabilityDays) stable.set(c.skillId, (stable.get(c.skillId) ?? 0) + 1);
  }
  const byModule = new Map<string, SkillView[]>();
  for (const skill of input.skills) {
    const moduleId = moduleOfTopic(skill.topic)?.id;
    if (!moduleId) continue;
    const status = statuses.get(skill.id) as SkillStatus;
    const itemCount = skill.items().length;
    const stableCount = Math.min(itemCount, stable.get(skill.id) ?? 0);
    const mastery = status === 'mastered' ? 1 : itemCount === 0 ? 0 : stableCount / itemCount;
    const list = byModule.get(moduleId) ?? [];
    list.push({ skill, status, itemCount, stableCount, mastery });
    byModule.set(moduleId, list);
  }
  return orderModules(input.goal, input.modules).map((module) => {
    const skills = byModule.get(module.id) ?? [];
    const items = skills.reduce((n, s) => n + s.itemCount, 0);
    const weighted = skills.reduce((n, s) => n + s.mastery * s.itemCount, 0);
    return {
      module,
      skills,
      state: moduleState(skills),
      mastery: items === 0 ? 0 : weighted / items,
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

/** A 0–1 fraction as a whole, clamped percentage. */
export function percent(fraction: number): number {
  return Math.round(Math.max(0, Math.min(1, fraction)) * 100);
}

/** A skill's ring state: its status in the module states' terms. */
export function skillRingState(status: SkillStatus): ModuleState {
  if (status === 'mastered') return 'mastered';
  return status === 'locked' ? 'locked' : 'open';
}
