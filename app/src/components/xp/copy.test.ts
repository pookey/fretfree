import { describe, expect, it } from 'vitest';
import { ENGINE_CONFIG } from '../../engine';
import { XP_EXPLAINER, formatXp, formatXpCompact, toSpendText, xpEarnedText } from './copy';

/** Words that would describe XP or the balance as falling or lost (design §3.7, §3.8). */
const LOSS = /\b(lose|loses|lost|loss|fall|falls|drop|drops|reduce|deduct|gone|can.t afford)\b/i;

describe('XP copy', () => {
  it('formats whole numbers, and compacts large ones for the rail', () => {
    expect(formatXp(1240)).toBe('1,240');
    expect(formatXp(0)).toBe('0');
    expect(formatXpCompact(980)).toBe('980');
    expect(formatXpCompact(1000)).toBe('1k');
    expect(formatXpCompact(1290)).toBe('1.2k');
    expect(formatXpCompact(25_999)).toBe('25k');
    expect(formatXpCompact(2_450_000)).toBe('2.4m');
  });

  it('names XP earned and the Garage balance', () => {
    expect(xpEarnedText(1240)).toBe('1,240 XP earned');
    expect(toSpendText(380)).toBe('380 to spend in the Garage');
  });

  it('is loss-free', () => {
    for (const line of [...XP_EXPLAINER, xpEarnedText(5), toSpendText(0)])
      expect(line).not.toMatch(LOSS);
  });

  it('says what the XP config does: due and new count most, wrong answers still earn', () => {
    const { attempt, correctBonus, fluentBonus, kindWeight } = ENGINE_CONFIG.gamification.xp;
    const top = Math.max(...Object.values(kindWeight));
    expect(kindWeight.due).toBe(top);
    expect(kindWeight.new).toBe(top);
    expect(kindWeight['not-due']).toBeLessThan(top);
    expect(attempt).toBeGreaterThan(0);
    expect(correctBonus + fluentBonus).toBeGreaterThan(0);
    expect(XP_EXPLAINER[0]).toMatch(/right or wrong/);
    expect(XP_EXPLAINER[0]).toMatch(/due .* new .* count most/);
    expect(XP_EXPLAINER[1]).toMatch(/buy parts for your guitar/);
  });
});
