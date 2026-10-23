import { useId } from 'react';
import { XP_EXPLAINER, XP_EXPLAINER_TITLE } from './copy';
import styles from './XpExplainer.module.css';

export interface XpExplainerProps {
  className?: string;
  /** The heading's class, so it can match the screen's own section titles. */
  titleClassName?: string;
}

/** "What XP is for": why XP grows and what it buys (design §3.8). */
export function XpExplainer({ className, titleClassName }: XpExplainerProps) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className={[styles.explainer, className].filter(Boolean).join(' ')}
      data-testid="xp-explainer"
    >
      <h2 id={id} className={titleClassName ?? styles.title}>
        {XP_EXPLAINER_TITLE}
      </h2>
      {XP_EXPLAINER.map((line) => (
        <p key={line}>{line}</p>
      ))}
    </section>
  );
}
