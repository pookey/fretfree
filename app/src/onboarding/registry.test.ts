import { describe, expect, it } from 'vitest';
import { ONBOARDING_STEPS } from './registry';

describe('onboarding step registry', () => {
  it('lists the steps in order, every one skippable and titled', () => {
    const orders = ONBOARDING_STEPS.map((s) => s.order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
    for (const step of ONBOARDING_STEPS) {
      expect(step.skippable).toBe(true);
      expect(step.title).toBeTruthy();
    }
  });
});
