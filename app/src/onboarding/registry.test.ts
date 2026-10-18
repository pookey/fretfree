import { describe, expect, it } from 'vitest';
import { ONBOARDING_STEPS } from './registry';

describe('onboarding step registry', () => {
  it('lists the steps in order, every one skippable, titled and explained', () => {
    const orders = ONBOARDING_STEPS.map((s) => s.order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
    for (const step of ONBOARDING_STEPS) {
      expect(step.skippable).toBe(true);
      expect(step.title).toBeTruthy();
      expect(step.explanation).toBeTruthy();
    }
  });

  it('asks about the guitar, goal, daily goal, notation and session length, in that order', () => {
    const core = ['hand-and-tuning', 'goal', 'daily-goal', 'notation', 'session-length'];
    // Other steps (e.g. M1-07's calibration) may slot in between.
    expect(ONBOARDING_STEPS.map((s) => s.id).filter((id) => core.includes(id))).toEqual(core);
  });
});
