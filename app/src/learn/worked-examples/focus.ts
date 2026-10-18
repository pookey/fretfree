import type { Skill } from '../../engine';

/**
 * "Practise this now" (design §7 Learn): a focused session on one skill.
 * The session route reads `?skill=` and runs only that skill's items, with
 * the usual FSRS ordering, gating and guide levels.
 */

export const FOCUS_PARAM = 'skill';

export function practiseHref(skillId: string): string {
  return `/session?${new URLSearchParams({ [FOCUS_PARAM]: skillId }).toString()}`;
}

/** The skills a session runs: just the focused one, or all when there's no (known) focus. */
export function focusedSkills(skills: readonly Skill[], focus: string | null): readonly Skill[] {
  const picked = skills.filter((s) => s.id === focus);
  return picked.length > 0 ? picked : skills;
}
