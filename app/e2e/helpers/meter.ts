import { ALL_SKILL_IDS } from './skills';

/** The meter track's skills (T1, T2, M8-05): they open once F4's pulse is under way. */
export const METER_SKILLS: readonly string[] = ALL_SKILL_IDS.filter((id) => /^T\d+\./.test(id));
