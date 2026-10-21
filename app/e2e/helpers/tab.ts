import { ALL_SKILL_IDS } from './skills';

/** The tab track's skills (TAB, M9-02): they open once F3's fret markers are under way. */
export const TAB_SKILLS: readonly string[] = ALL_SKILL_IDS.filter((id) => id.startsWith('TAB.'));
