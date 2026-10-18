import { useState } from 'react';
import { useAppStore } from '../../app-store';
import { Choices, StepForm } from '../Choices';
import { GOAL_OPTIONS } from '../options';
import type { OnboardingStepProps } from '../registry';

export const id = 'goal';
export const order = 20;
export const title = 'What do you want to play?';
export const skippable = true;
export const explanation = (
  <p>
    Your goal decides which topics come next and which progressions and songs the examples use. The
    practice itself works the same way for everyone.
  </p>
);

export function Step({ onNext }: OnboardingStepProps) {
  const current = useAppStore((s) => s.settings.goal);
  const update = useAppStore((s) => s.update);
  const [goal, setGoal] = useState(current);
  const save = async () => {
    await update({ goal });
    onNext();
  };
  return (
    <StepForm onSubmit={() => void save()}>
      <Choices legend="My goal" options={GOAL_OPTIONS} value={goal} onChange={setGoal} />
    </StepForm>
  );
}
