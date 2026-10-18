import { useId, type ReactNode } from 'react';
import type { Option } from './options';
import styles from './Onboarding.module.css';

/** A labelled group of large radio cards: one tap picks an option. */
export function Choices<T extends string | number>({
  legend,
  options,
  value,
  onChange,
}: {
  legend: string;
  options: readonly Option<T>[];
  value: NoInfer<T>;
  onChange(value: NoInfer<T>): void;
}) {
  const name = useId();
  return (
    <fieldset className={styles.choices}>
      <legend className={styles.legend}>{legend}</legend>
      {options.map((o) => (
        <label key={o.value} className={styles.choice}>
          <input
            type="radio"
            name={name}
            value={o.value}
            checked={o.value === value}
            onChange={() => onChange(o.value)}
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

/** The step's choices and its Continue button, which saves and moves on. */
export function StepForm({ children, onSubmit }: { children: ReactNode; onSubmit(): void }) {
  return (
    <form
      className={styles.stepForm}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      {children}
      <button type="submit" className={styles.primary}>
        Continue
      </button>
    </form>
  );
}
