import { useState } from 'react';
import { useAppStore } from '../../app-store';
import { Choices, StepForm } from '../Choices';
import { NOTATION_OPTIONS } from '../options';
import type { OnboardingStepProps } from '../registry';

export const id = 'notation';
export const order = 40;
export const title = 'Do you read music?';
export const skippable = true;
export const explanation = (
  <p>
    If you read tab or standard notation, we add drills that link it to the neck. If not, you learn
    everything by name, position and sound.
  </p>
);

export function Step({ onNext }: OnboardingStepProps) {
  const current = useAppStore((s) => s.settings.notation);
  const update = useAppStore((s) => s.update);
  const [notation, setNotation] = useState(current);
  const save = async () => {
    await update({ notation });
    onNext();
  };
  return (
    <StepForm onSubmit={() => void save()}>
      <Choices legend="I read" options={NOTATION_OPTIONS} value={notation} onChange={setNotation} />
    </StepForm>
  );
}
