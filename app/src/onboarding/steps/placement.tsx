import { ENGINE_CONFIG } from '../../engine/config';
import { PlacementTest } from '../../placement/PlacementTest';
import { StepForm } from '../Choices';
import type { OnboardingStepProps } from '../registry';

export const id = 'placement';
// Last: design §4 puts the placement test after calibration, whose tap time it grades on.
export const order = 70;
export const title = 'Already play a bit?';
export const skippable = true;
export const explanation = (
  <>
    <p>
      A short test finds what you already know, so you don’t practise it from scratch. It adapts as
      you go: right answers move on to harder questions, and it stops asking about anything you
      don’t know yet.
    </p>
    <p>
      What you know quickly comes back for a check-up in about{' '}
      {ENGINE_CONFIG.fsrs.seededStabilityDays} days. New to the guitar? Skip this step and start at
      the beginning.
    </p>
  </>
);

export function Step({ onNext }: OnboardingStepProps) {
  return <PlacementTest doneAction={<StepForm onSubmit={onNext}>{null}</StepForm>} />;
}
