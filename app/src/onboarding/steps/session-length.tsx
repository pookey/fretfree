import { useState } from 'react';
import { useAppStore } from '../../app-store';
import { Choices, StepForm } from '../Choices';
import { SESSION_LENGTH_OPTIONS } from '../options';
import type { OnboardingStepProps } from '../registry';

export const id = 'session-length';
export const order = 50;
export const title = 'How long is a session?';
export const skippable = true;
export const explanation = (
  <p>
    This is how long the Start button runs for. Short, focused sessions work best; to reach a bigger
    daily goal, do two sessions at different times of day.
  </p>
);

export function Step({ onNext }: OnboardingStepProps) {
  const current = useAppStore((s) => s.settings.sessionMinutes);
  const update = useAppStore((s) => s.update);
  const [sessionMinutes, setSessionMinutes] = useState(current);
  const save = async () => {
    await update({ sessionMinutes });
    onNext();
  };
  return (
    <StepForm onSubmit={() => void save()}>
      <Choices
        legend="Session length"
        options={SESSION_LENGTH_OPTIONS}
        value={sessionMinutes}
        onChange={setSessionMinutes}
      />
    </StepForm>
  );
}
