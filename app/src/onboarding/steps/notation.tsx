import { useState } from 'react';
import { useAppStore } from '../../app-store';
import type { Notation, NotationSet } from '../../engine/model';
import { StepForm } from '../Choices';
import { NOTATION_OPTIONS } from '../options';
import type { OnboardingStepProps } from '../registry';
import styles from '../Onboarding.module.css';
import local from './notation.module.css';

export const id = 'notation';
export const order = 40;
export const title = 'Reading music';
export const skippable = true;
export const explanation = (
  <>
    <p>
      Fretwork teaches the neck by name, position and sound either way. Reading tab or standard
      notation is extra.
    </p>
    <p>
      What you already read gets drills that link it to the neck. What you want to learn gets its
      reading track moved up. Tick both, one or neither: every reading track stays open to try.
    </p>
  </>
);

/** A labelled group of checkbox cards: pick any, both or none. */
function Picks({
  legend,
  value,
  onChange,
}: {
  legend: string;
  value: NotationSet;
  onChange(value: NotationSet): void;
}) {
  const toggle = (n: Notation) => onChange({ ...value, [n]: !value[n] });
  return (
    <fieldset className={styles.choices}>
      <legend className={styles.legend}>{legend}</legend>
      {NOTATION_OPTIONS.map((o) => (
        <label key={o.value} className={`${styles.choice} ${local.check}`}>
          <input
            type="checkbox"
            value={o.value}
            checked={value[o.value]}
            onChange={() => toggle(o.value)}
          />
          <span className={styles.choiceText}>
            <strong>{o.label}</strong>
            {o.detail && <span>{o.detail}</span>}
          </span>
        </label>
      ))}
    </fieldset>
  );
}

export function Step({ onNext }: OnboardingStepProps) {
  const current = useAppStore((s) => s.settings.reading);
  const update = useAppStore((s) => s.update);
  const [reads, setReads] = useState(current.reads);
  const [learn, setLearn] = useState(current.learn);
  const save = async () => {
    await update({ reading: { reads, learn } });
    onNext();
  };
  return (
    <StepForm onSubmit={() => void save()}>
      <Picks legend="What can you already read?" value={reads} onChange={setReads} />
      <Picks legend="What would you like to learn to read?" value={learn} onChange={setLearn} />
    </StepForm>
  );
}
