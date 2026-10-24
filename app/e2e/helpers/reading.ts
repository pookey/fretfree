import { ALL_SKILL_IDS } from './skills';

/**
 * The reading track's skills (R1–R7, M8): R3 opens once I3's sharp
 * signatures are under way, so a spec that masters Keys keeps their new
 * cards out of its session by mastering these too.
 */
export const READING_SKILLS: readonly string[] = ALL_SKILL_IDS.filter((id) => /^R\d+\./.test(id));
