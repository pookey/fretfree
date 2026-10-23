import { useState } from 'react';
import { useAppStore } from '../../app-store';
import { Choices, StepForm } from '../Choices';
import type { Option } from '../options';
import type { OnboardingStepProps } from '../registry';

export const id = 'start-with-sound';
// After the reading question: readers and ear players each pick their way in (research/02).
export const order = 45;
export const title = 'Where do you want to start?';
export const skippable = true;
export const explanation = (
  <>
    <p>
      If you play by ear, start with sound: FretFree plays a note and you find it on the neck by
      listening. Ear training comes first, and note names follow.
    </p>
    <p>
      Either way you learn the same things, with the same practice. This only changes what comes
      first.
    </p>
  </>
);

type Start = 'neck' | 'sound';

const START_OPTIONS: readonly Option<Start>[] = [
  {
    value: 'neck',
    label: 'The neck',
    detail: 'Note names on the fretboard first, with ear training alongside',
  },
  { value: 'sound', label: 'Sound', detail: 'Hear a note, then find it on the neck' },
];

export function Step({ onNext }: OnboardingStepProps) {
  const current = useAppStore((s) => s.settings.startWithSound);
  const update = useAppStore((s) => s.update);
  const [start, setStart] = useState<Start>(current ? 'sound' : 'neck');
  const save = async () => {
    await update({ startWithSound: start === 'sound' });
    onNext();
  };
  return (
    <StepForm onSubmit={() => void save()}>
      <Choices legend="Start with" options={START_OPTIONS} value={start} onChange={setStart} />
    </StepForm>
  );
}
