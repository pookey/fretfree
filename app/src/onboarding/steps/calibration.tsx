import { Calibration } from '../calibration/Calibration';
import { StepForm } from '../Choices';
import type { OnboardingStepProps } from '../registry';

export const id = 'calibration';
// After session length: design §4 puts calibration after daily time.
export const order = 60;
export const title = 'Tap the lit dots';
export const skippable = true;
export const explanation = (
  <p>
    Answers that come quickly are the ones you really know, so we time them. Your screen and your
    reach add a little to every answer; this measures that, so only the thinking counts.
  </p>
);

export function Step({ onNext }: OnboardingStepProps) {
  return <Calibration doneAction={<StepForm onSubmit={onNext}>{null}</StepForm>} />;
}
