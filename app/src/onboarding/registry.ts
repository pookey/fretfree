import type { ComponentType } from 'react';
import { ordered, type Ordered } from '../registry';

export interface OnboardingStepProps {
  /** Move to the next step (or finish after the last). */
  onNext(): void;
}

/**
 * What every `onboarding/steps/<id>.tsx` file exports. Every step can be
 * skipped: onboarding never blocks practice.
 */
export interface OnboardingStep extends Ordered {
  title: string;
  Step: ComponentType<OnboardingStepProps>;
  skippable: true;
}

/**
 * The first-launch steps, in `order`. One file per step: each
 * `steps/<id>.tsx` is registered automatically. M1-06 builds the flow.
 */
export const ONBOARDING_STEPS: readonly OnboardingStep[] = ordered(
  import.meta.glob<OnboardingStep>(['./steps/*.tsx', '!./steps/*.test.tsx'], { eager: true }),
);
