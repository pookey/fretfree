import { useCallback, useEffect, useId, useRef, useState, type MouseEvent } from 'react';
import { useAppStore } from '../app-store';
import { ENGINE_CONFIG } from '../engine';
import { IntroDiagram } from '../learn/intros/Diagram';
import type { ConceptIntro } from '../learn/intros/types';
import styles from './ConceptCard.module.css';

export interface ConceptCardProps {
  intro: ConceptIntro;
  /**
   * Called once: on a tap anywhere on the card (after `intros.tapGuardMs`),
   * or Enter or Space unless they're aimed at a control outside the card.
   */
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
  // Ready for taps once a tap aimed at the prompt before can no longer land here.
  const [ready, setReady] = useState(false);
  const latest = useRef(onDismiss);
  useEffect(() => {
    latest.current = onDismiss;
  });
  const dismiss = useCallback(() => {
    if (done.current) return;
    done.current = true;
    latest.current();
  }, []);

  useEffect(() => {
    // The card sits where the drill will be: focusing it must not scroll the page.
    cardRef.current?.focus({ preventScroll: true });
    const timer = window.setTimeout(() => setReady(true), ENGINE_CONFIG.intros.tapGuardMs);
    const onKey = (e: KeyboardEvent) => {
      // A focused control outside the card ("End session", "Show help") keeps its keys.
      const target = e.target instanceof Element ? e.target : null;
      const control = target?.closest('button, a, input, select, textarea');
      if (control && !cardRef.current?.contains(control)) return;
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        dismiss();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', onKey);
    };
  }, [dismiss]);

  // A keyboard or screen-reader click (detail 0) is deliberate: never guarded.
  const onClick = (e: MouseEvent) => {
    if (ready || e.detail === 0) dismiss();
  };

  return (
    // A tap anywhere dismisses it; keys go through the window listener above,
    // so the button is for show and for screen readers.
    <section
      ref={cardRef}
      className={styles.card}
      aria-labelledby={titleId}
      tabIndex={-1}
      data-testid="concept-card"
      data-intro={intro.id}
      data-diagram={intro.diagram?.kind}
      data-ready={ready || undefined}
      onClick={onClick}
    >
      <p className={styles.kicker}>New idea</p>
      <h2 id={titleId} className={styles.title}>
        {intro.title}
      </h2>
      <p className={styles.text}>{intro.text}</p>
      {intro.diagram && (
        <div className={styles.diagram}>
          <IntroDiagram
            diagram={intro.diagram}
            handedness={settings.handedness}
            pref={settings.accidentalPref}
          />
        </div>
      )}
      <button type="button" className={styles.go} aria-keyshortcuts="Enter Space">
        Got it
      </button>
    </section>
  );
}
