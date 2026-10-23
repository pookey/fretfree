/**
 * XP copy (design §3.7, §3.8). XP earned only ever grows, and the Garage
 * balance is "to spend": no line here says either one falls or is lost.
 */

export const XP_EXPLAINER_TITLE = 'What XP is for';

/** Why XP grows and what it buys, in plain words. True to `gamification.xp` (see copy.test.ts). */
export const XP_EXPLAINER = [
  'You earn XP for every answer, right or wrong. Reviews that are due and new things to learn count most, and a quick right answer adds a little more. Going over what you already know well earns less.',
  'XP earned is your total for all time. Use it to buy parts for your guitar in the Garage. What you buy is yours to keep, and your XP earned stays as it is.',
] as const;

const whole = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });

/** "1,240". */
export function formatXp(xp: number): string {
  return whole.format(xp);
}

/**
 * "1.2k", for the collapsed sidebar rail: exact below 1,000, rounded down so
 * it never shows more than was earned. Not `Intl`'s compact notation, whose
 * case differs between engines.
 */
export function formatXpCompact(xp: number): string {
  if (xp < 1000) return formatXp(xp);
  if (xp < 10_000) return `${Math.floor(xp / 100) / 10}k`;
  if (xp < 1_000_000) return `${formatXp(Math.floor(xp / 1000))}k`;
  return `${Math.floor(xp / 100_000) / 10}m`;
}

/** "1,240 XP earned". */
export function xpEarnedText(xp: number): string {
  return `${formatXp(xp)} XP earned`;
}

/** "380 to spend in the Garage". */
export function toSpendText(toSpend: number): string {
  return `${formatXp(toSpend)} to spend in the Garage`;
}
