import type { ComponentType, ReactNode } from 'react';
import { ordered, type Ordered } from '../registry';

export interface OnboardingStepProps {
  /** Move to the next step (or finish after the last). */
  onNext(): void;
}

/**
 * What every `onboarding/steps/<id>.tsx` file exports. Every step can be
 * skipped: onboarding never blocks practice. At regular-wide the flow shows
 * `title` and `explanation` on the left and `Step` (the choice) on the right.
 */
export interface OnboardingStep extends Ordered {
  title: string;
  /** Why we ask, in a sentence or two. */
  explanation: ReactNode;
  /** The choice. It persists what the learner picks, then calls `onNext`. */
  Step: ComponentType<OnboardingStepProps>;
  skippable: true;
  /** Whether the step applies on this device (e.g. only where the app can be installed). Default: yes. */
  available?(): boolean;
  /** False for a step that asks nothing (e.g. install), so the welcome's question count leaves it out. */
  question?: false;
}

/**
 * The first-launch steps, in `order`. One file per step: each
 * `steps/<id>.tsx` is registered automatically.
 */
export const ONBOARDING_STEPS: readonly OnboardingStep[] = ordered(
  import.meta.glob<OnboardingStep>(['./steps/*.tsx', '!./steps/*.test.tsx'], { eager: true }),
);
