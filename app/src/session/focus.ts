import { parseItemId, type Item, type Skill } from '../engine';

/**
 * Focused sessions: "Practise this now" in Learn and "Quiz me on this" in
 * Explore (design §7). A focus narrows what a session may serve to some
 * skills and/or items. Inside it the session is planned as usual: due cards
 * by FSRS retrievability, new items in short blocks then interleaved,
 * confusable pairing, stretch items, and gating stays on (research/02
 * rules 6 and 7). A focus never serves stable cards that are not due, so it
 * can't turn into cramming (rule 11, design §3.7).
 *
 * The URL contract is `/session?skill=<id>` (repeatable) and `&item=<id>`
 * (repeatable). An item is in focus when its skill or the item itself is
 * listed. Unknown IDs are dropped; a focus with nothing known left is no
 * focus, and the session runs every skill.
 */

export const FOCUS_PARAM = 'skill';
export const ITEM_PARAM = 'item';

export interface SessionFocus {
  readonly skillIds: readonly string[];
  readonly itemIds: readonly string[];
}

export function focusHref(focus: Partial<SessionFocus>): string {
  const params = new URLSearchParams();
  for (const id of focus.skillIds ?? []) params.append(FOCUS_PARAM, id);
  for (const id of focus.itemIds ?? []) params.append(ITEM_PARAM, id);
  const query = params.toString();
  return query ? `/session?${query}` : '/session';
}

/** "Practise this now" for one skill. */
export function practiseHref(skillId: string): string {
  return focusHref({ skillIds: [skillId] });
}

/** The focus in a session URL's query, keeping only IDs the skills know. Null for none. */
export function parseFocus(params: URLSearchParams, skills: readonly Skill[]): SessionFocus | null {
  const known = new Set(skills.map((s) => s.id));
  const skillIds = [...new Set(params.getAll(FOCUS_PARAM))].filter((id) => known.has(id));
  const wanted = new Set(params.getAll(ITEM_PARAM));
  const itemIds =
    wanted.size === 0
      ? []
      : skills.flatMap((s) => s.items().filter((i) => wanted.has(i.id))).map((i) => i.id);
  if (skillIds.length === 0 && itemIds.length === 0) return null;
  return { skillIds, itemIds: [...new Set(itemIds)] };
}

/** A predicate for the items a focus lets a session serve. No focus lets everything through. */
export function focusFilter(focus: SessionFocus | null | undefined): (item: Item) => boolean {
  if (!focus) return () => true;
  const skills = new Set(focus.skillIds);
  const items = new Set(focus.itemIds);
  return (item) => skills.has(item.skillId) || items.has(item.id);
}

/**
 * The skills the fretboard explorer shows: every skill whose items name a
 * note at a position or find one on a string (D1 and D2). Its "Quiz me on
 * this" focuses on them, so new note skills join without editing the view.
 */
export function noteSkillIds(skills: readonly Skill[]): string[] {
  return skills
    .filter((s) => {
      const items = s.items();
      return (
        items.length > 0 &&
        items.every((i) => {
          const kind = parseItemId(i.id)?.kind;
          return kind === 'note' || kind === 'find';
        })
      );
    })
    .map((s) => s.id);
}

/**
 * The open skills nearest `targets`: those of them on the `frontier`, or,
 * walking back one level of prerequisites at a time, the nearest open ones.
 * Null when nothing on the way is open. Explore's "Quiz me on this" uses it
 * so a focus offers what the learner can practise now, with gating left on
 * (research/02 rule 7).
 */
export function nearestOpenSkills(
  targets: readonly string[],
  frontier: ReadonlySet<string>,
  skills: readonly Skill[],
): string[] | null {
  const byId = new Map(skills.map((s) => [s.id, s]));
  let level = targets.filter((id) => byId.has(id));
  const seen = new Set(level);
  while (level.length > 0) {
    const open = level.filter((id) => frontier.has(id));
    if (open.length > 0) return open;
    level = [...new Set(level.flatMap((id) => byId.get(id)?.prerequisites ?? []))].filter(
      (id) => byId.has(id) && !seen.has(id),
    );
    for (const id of level) seen.add(id);
  }
  return null;
}
