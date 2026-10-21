import { ENGINE_CONFIG } from './config';
import type { Skill, SkillStatus } from './model';

/**
 * "Start with sound" (design §4, research/02 personalisation: "ear players
 * can start with ear→fretboard drills"), an entry point chosen in
 * onboarding (`settings.startWithSound`). Like the goal profile it changes
 * where the path starts, never how it is practised: spacing, retrieval and
 * every other gate stay on (rule 16).
 *
 * - `startWithSoundSkills` opens the ear track on day one: an ear skill's
 *   day-one neck gates count as met, so its first sets are on the frontier
 *   before any neck practice.
 * - `leadWithSound` puts the ear skills at the front of the frontier,
 *   ear → fretboard (D15) first, but only until ear → fretboard is being
 *   practised. After that new items interleave in the usual goal order
 *   (rule 6), so the neck isn't held back for weeks.
 *
 * Both are the identity when the setting is off.
 */

interface Config {
  readonly topics: readonly string[];
  readonly openPrerequisites: readonly string[];
  readonly leading: readonly string[];
  readonly leadUntil: string;
}

const isEar = (skill: Skill, cfg: Config) => cfg.topics.includes(skill.topic);

/** The skills as gating sees them: ear skills drop their day-one neck prerequisites. */
export function startWithSoundSkills(
  skills: readonly Skill[],
  on: boolean,
  cfg: Config = ENGINE_CONFIG.startWithSound,
): readonly Skill[] {
  if (!on) return skills;
  const open = new Set(cfg.openPrerequisites);
  return skills.map((skill) => {
    if (!isEar(skill, cfg) || !skill.prerequisites.some((p) => open.has(p))) return skill;
    return { ...skill, prerequisites: skill.prerequisites.filter((p) => !open.has(p)) };
  });
}

/**
 * Frontier skills, already in goal order, with the ear skills moved to the
 * front: the `leading` ones first, in their order, then the rest of the ear
 * track. Stable, so each group keeps the goal profile's order. The lead ends
 * once `leadUntil` is practising or mastered (`statuses`, as stored): the
 * frontier then comes back in goal order, unchanged.
 */
export function leadWithSound(
  frontier: readonly Skill[],
  on: boolean,
  statuses: ReadonlyMap<string, SkillStatus>,
  cfg: Config = ENGINE_CONFIG.startWithSound,
): Skill[] {
  const until = statuses.get(cfg.leadUntil);
  if (!on || until === 'practising' || until === 'mastered') return [...frontier];
  const { leading } = cfg;
  const rank = (skill: Skill) => {
    const i = leading.indexOf(skill.id);
    if (i >= 0) return i;
    return isEar(skill, cfg) ? leading.length : leading.length + 1;
  };
  return frontier
    .map((skill, i) => ({ skill, i, rank: rank(skill) }))
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
    .map((e) => e.skill);
}
