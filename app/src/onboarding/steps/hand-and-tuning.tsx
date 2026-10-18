import { useState } from 'react';
import { useAppStore } from '../../app-store';
import { TUNINGS } from '../../theory';
import { Choices, StepForm } from '../Choices';
import { HANDEDNESS_OPTIONS } from '../options';
import type { OnboardingStepProps } from '../registry';

export const id = 'hand-and-tuning';
export const order = 10;
export const title = 'Your guitar';
export const skippable = true;
export const explanation = (
  <p>
    Left-handed players see the neck mirrored, the way they hold it. Every note on the neck follows
    from the tuning, so pick the one you play in. More tunings are coming.
  </p>
);

const TUNING_OPTIONS = TUNINGS.map((t) => ({ value: t.id, label: t.name }));

export function Step({ onNext }: OnboardingStepProps) {
  const settings = useAppStore((s) => s.settings);
  const update = useAppStore((s) => s.update);
  const [handedness, setHandedness] = useState(settings.handedness);
  const [tuning, setTuning] = useState(settings.tuning);
  const save = async () => {
    await update({ handedness, tuning });
    onNext();
  };
  return (
    <StepForm onSubmit={() => void save()}>
      <Choices
        legend="I play"
        options={HANDEDNESS_OPTIONS}
        value={handedness}
        onChange={setHandedness}
      />
      <Choices legend="Tuning" options={TUNING_OPTIONS} value={tuning} onChange={setTuning} />
    </StepForm>
  );
}
