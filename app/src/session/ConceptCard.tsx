import { useEffect, useId, useRef } from 'react';
import { useAppStore } from '../app-store';
import { IntroDiagram } from '../learn/intros/Diagram';
import type { ConceptIntro } from '../learn/intros/types';
import styles from './ConceptCard.module.css';

export interface ConceptCardProps {
  intro: ConceptIntro;
  /** Called once, on a tap anywhere on the card, Enter or Space. */
  onDismiss(): void;
}

/**
 * A new skill's concept intro (M10-04, research/02 rule 8), shown before its
 * first worked rep. It takes focus, so a keyboard learner can read it and go
 * on with Enter or Space; nothing on it is graded or timed. It loads with
 * the intros (`learn/intros/lazy.ts`), so it isn't first-load JS.
 */
export function ConceptCard({ intro, onDismiss }: ConceptCardProps) {
  const settings = useAppStore((s) => s.settings);
  const titleId = useId();
  const cardRef = useRef<HTMLElement>(null);
  const done = useRef(false);
  const dismiss = useRef(() => {});
  dismiss.current = () => {
    if (done.current) return;
    done.current = true;
    onDismiss();
  };

  useEffect(() => {
    // The card sits where the drill will be: focusing it must not scroll the page.
    cardRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        dismiss.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    // A tap anywhere dismisses it; keys go through the window listener above,
    // wherever focus is, so the button is for show and for screen readers.
    <section
      ref={cardRef}
      className={styles.card}
      aria-labelledby={titleId}
      tabIndex={-1}
      data-testid="concept-card"
      data-intro={intro.id}
      onClick={() => dismiss.current()}
    >
      <p className={styles.kicker}>New idea</p>
      <h2 id={titleId} className={styles.title}>
        {intro.title}
      </h2>
      <p className={styles.text}>{intro.text}</p>
      {intro.diagram && (
        <IntroDiagram
          diagram={intro.diagram}
          handedness={settings.handedness}
          pref={settings.accidentalPref}
        />
      )}
      <button type="button" className={styles.go} aria-keyshortcuts="Enter Space">
        Got it
      </button>
    </section>
  );
}
