import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { confettiPieces } from './pieces';
import { useReducedMotion } from './reduced-motion';
import styles from './Confetti.module.css';

export interface ConfettiProps {
  /** Fire once when true. Callers pass true only for milestones (design §3.7). */
  active: boolean;
  count?: number;
  rng?: () => number;
}

/**
 * A one-shot confetti burst over the screen. Decorative: hidden from
 * assistive tech, never intercepts taps, and renders nothing under reduced
 * motion, so the milestone copy carries the moment on its own.
 */
export function Confetti({ active, count = 80, rng = Math.random }: ConfettiProps) {
  const reduced = useReducedMotion();
  const pieces = useMemo(() => confettiPieces(count, rng), [count, rng]);
  const [done, setDone] = useState(false);
  const show = active && !reduced && !done;

  useEffect(() => {
    if (!show) return;
    const lastMs = Math.max(0, ...pieces.map((p) => p.delayMs + p.durationMs));
    const t = window.setTimeout(() => setDone(true), lastMs + 100);
    return () => window.clearTimeout(t);
  }, [show, pieces]);

  if (!show) return null;
  return (
    <div className={styles.layer} aria-hidden="true" data-testid="confetti">
      {pieces.map((p, i) => (
        <span
          key={i}
          className={styles.piece}
          data-shape={p.shape}
          style={
            {
              '--x': `${p.x}%`,
              '--drift': `${p.drift}rem`,
              '--spin': `${p.spin}deg`,
              '--size': `${p.size}rem`,
              '--colour': p.colour,
              animationDelay: `${p.delayMs}ms`,
              animationDuration: `${p.durationMs}ms`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
