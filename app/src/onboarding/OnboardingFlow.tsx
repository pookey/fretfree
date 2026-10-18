import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../app-store';
import { useSizeClass } from '../shell/size-class';
import { About } from './About';
import { ONBOARDING_STEPS, type OnboardingStep } from './registry';
import styles from './Onboarding.module.css';

/**
 * First-launch onboarding (design §4): a welcome with the About copy, then one
 * screen per registered step. Every step can be skipped, and so can the whole
 * flow. Finishing or skipping sets `settings.onboardedAt`, so the first-launch
 * guard lets the learner through from then on.
 */
export function OnboardingFlow({
  steps = ONBOARDING_STEPS,
  onDone,
  now = () => new Date(),
}: {
  steps?: readonly OnboardingStep[];
  onDone(): void;
  now?: () => Date;
}) {
  const sizeClass = useSizeClass();
  const update = useAppStore((s) => s.update);
  // -1 is the welcome screen.
  const [index, setIndex] = useState(-1);
  const heading = useRef<HTMLHeadingElement>(null);
  const step = steps[index];

  // Screen readers and keyboards start each screen at its heading.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) first.current = false;
    else heading.current?.focus();
  }, [index]);

  const finish = async () => {
    await update({ onboardedAt: now() });
    onDone();
  };
  const next = () => {
    if (index + 1 < steps.length) setIndex(index + 1);
    else void finish();
  };

  return (
    <main className={styles.flow} data-size-class={sizeClass} data-testid="onboarding">
      <header className={styles.header}>
        <span className={styles.brand}>
          <span aria-hidden>♪</span> Fretwork
        </span>
        {step && (
          <p className={styles.counter} data-testid="onboarding-progress">
            Step {index + 1} of {steps.length}
          </p>
        )}
        <button type="button" className={styles.link} onClick={() => void finish()}>
          Skip setup
        </button>
      </header>

      {step ? (
        <div className={styles.panes} key={step.id} data-step={step.id}>
          <section className={styles.explain} data-testid="onboarding-explanation">
            <h1 ref={heading} tabIndex={-1}>
              {step.title}
            </h1>
            {step.explanation}
          </section>
          <section
            className={styles.choose}
            aria-label={step.title}
            data-testid="onboarding-choice"
          >
            <step.Step onNext={next} />
            <div className={styles.secondary}>
              <button type="button" className={styles.link} onClick={() => setIndex(index - 1)}>
                Back
              </button>
              <button type="button" className={styles.link} onClick={next}>
                Skip this step
              </button>
            </div>
          </section>
        </div>
      ) : (
        <div className={styles.panes} data-step="welcome">
          <section className={styles.explain} data-testid="onboarding-explanation">
            <h1 ref={heading} tabIndex={-1}>
              Welcome to Fretwork
            </h1>
            <About />
          </section>
          <section
            className={styles.choose}
            aria-label="Get started"
            data-testid="onboarding-choice"
          >
            <p className={styles.lead}>
              {steps.length} quick questions so your practice fits you. It takes under 3 minutes,
              and you can skip any of them or change them later in Progress.
            </p>
            <button
              type="button"
              className={styles.primary}
              onClick={() => (steps.length ? setIndex(0) : void finish())}
            >
              Get started
            </button>
          </section>
        </div>
      )}
    </main>
  );
}
