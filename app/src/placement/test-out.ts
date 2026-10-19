import { ENGINE_CONFIG } from '../engine/config';
import { moduleOfTopic, type Module } from '../engine/frontier';
import { deriveStatus, isFrontier } from '../engine/mastery';
import type { CardRecord, Item, Skill, SkillStatus } from '../engine/model';
import { skillGroups, type GroupInput } from './algorithm';
import type { PlacementSummary } from './save';

/**
 * "Test out" of a locked module (design §3.4, research/02 rule 7). Rule 7
 * gates on mastery, not time served, so a learner who already knows what a
 * module builds on can prove it: the placement probe, scoped to the
 * prerequisites the module's first skills still lack. Pure: statuses in,
 * skill IDs and a report out.
 */

/** A module's skills, in registry (curriculum) order. */
export function moduleSkills(module: Module, skills: readonly Skill[]): Skill[] {
  return skills.filter((s) => module.topics.includes(s.topic));
}

/**
 * The module's first skills: those whose prerequisites all lie outside it.
 * They are the ones that open the module.
 */
export function entrySkills(module: Module, skills: readonly Skill[]): Skill[] {
  const mine = moduleSkills(module, skills);
  const ids = new Set(mine.map((s) => s.id));
  return mine.filter((s) => s.prerequisites.every((p) => !ids.has(p)));
}

/** True when `status` meets `skill`'s prerequisite rule (`deriveStatus`). */
function meets(skill: Skill, status: SkillStatus | undefined): boolean {
  return status === 'mastered' || (skill.softUnlock === true && status === 'practising');
}

/**
 * The prerequisites a locked module still needs, in curriculum order: every
 * prerequisite of a locked first skill that doesn't yet meet its unlock rule.
 * For Chords on a fresh profile, the C3 and C4 skills `C5.triads` needs.
 */
export function unmetPrerequisites(
  module: Module,
  skills: readonly Skill[],
  statuses: ReadonlyMap<string, SkillStatus>,
): string[] {
  const unmet = new Set<string>();
  for (const skill of entrySkills(module, skills)) {
    if (statuses.get(skill.id) !== 'locked') continue;
    for (const p of skill.prerequisites) if (!meets(skill, statuses.get(p))) unmet.add(p);
  }
  return skills.filter((s) => unmet.has(s.id)).map((s) => s.id);
}

/** The probe groups of a test-out: the unmet prerequisites a drill can test. */
export function testOutGroups(
  skillIds: readonly string[],
  skills: readonly Skill[],
  canServe: (item: Item) => boolean,
): GroupInput[] {
  return skillGroups(skills, canServe, (s) => skillIds.includes(s.id));
}

/** True for a card the learner has, still below the mastery stability. */
export function isWeakCard(
  card: CardRecord,
  stabilityDays: number = ENGINE_CONFIG.mastery.stabilityDays,
): boolean {
  return card.fsrs.stability < stabilityDays;
}

/**
 * The groups with every weak card's item made a probe (`mustProbe`). A
 * test-out masters what it passes, so a few fluent probes mustn't vouch for
 * items the learner's own reviews show are still shaky: each one is asked,
 * and must be fluent too (rule 7). A fresh profile has no cards, so nothing
 * changes for it.
 */
export function withWeakItems(
  groups: readonly GroupInput[],
  cards: readonly CardRecord[],
  stabilityDays: number = ENGINE_CONFIG.mastery.stabilityDays,
): GroupInput[] {
  const weak = new Set(cards.filter((c) => isWeakCard(c, stabilityDays)).map((c) => c.itemId));
  return groups.map((g) => ({
    ...g,
    mustProbe: g.items.filter((i) => weak.has(i.id)).map((i) => i.id),
  }));
}

/**
 * Whether the module opens once `summary` is saved: its skills' statuses
 * re-derived with the test-out's known skills practising or mastered (never
 * lowered), as the Learn map will show them.
 */
export function opensAfter(
  module: Module,
  skills: readonly Skill[],
  statuses: ReadonlyMap<string, SkillStatus>,
  summary: Pick<PlacementSummary, 'knownSkills' | 'masteredSkills'>,
): boolean {
  const next = new Map(statuses);
  for (const id of summary.knownSkills) {
    if (summary.masteredSkills.includes(id)) next.set(id, 'mastered');
    else if (next.get(id) !== 'mastered') next.set(id, 'practising');
  }
  for (const s of skills) next.set(s.id, deriveStatus(s, next, next.get(s.id)));
  return moduleSkills(module, skills).some((s) => isFrontier(next.get(s.id) ?? 'locked'));
}

/** How a test-out went for one module the probed skills belong to. */
export interface TestOutLine {
  module: string;
  /** `known`: every probed skill of it passed; `partly`: some did; `practise`: none. */
  result: 'known' | 'partly' | 'practise';
}

/** The summary per module, in curriculum order: "Intervals: known. Keys: practise". */
export function testOutReport(
  summary: Pick<PlacementSummary, 'probedSkills' | 'masteredSkills'>,
  skills: readonly Skill[],
): TestOutLine[] {
  const byModule = new Map<string, { passed: number; total: number }>();
  for (const id of summary.probedSkills) {
    const topic = skills.find((s) => s.id === id)?.topic;
    const title = topic ? moduleOfTopic(topic)?.title : undefined;
    if (!title) continue;
    const m = byModule.get(title) ?? { passed: 0, total: 0 };
    m.total++;
    if (summary.masteredSkills.includes(id)) m.passed++;
    byModule.set(title, m);
  }
  return [...byModule].map(([module, { passed, total }]) => ({
    module,
    result: passed === total ? 'known' : passed > 0 ? 'partly' : 'practise',
  }));
}

const VERDICT: Readonly<Record<TestOutLine['result'], string>> = {
  known: 'known',
  partly: 'partly known, so let’s practise the rest first',
  practise: 'let’s practise those first',
};

/** One line's copy: "Intervals: known." */
export function reportSentence(line: TestOutLine): string {
  return `${line.module}: ${VERDICT[line.result]}.`;
}
