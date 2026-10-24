import { ALL_SKILL_IDS } from './skills';

/**
 * The reading track's skills (R1–R7, M8): R1 opens with the naturals on
 * strings 6 and 5 and with time signatures, and R3 with R1 and Keys, so a
 * spec that masters those keeps their new cards out of its session by
 * mastering these too.
 */
export const READING_SKILLS: readonly string[] = ALL_SKILL_IDS.filter((id) => /^R\d+\./.test(id));
