import type { DrillContextPanelProps } from '../types';
import { d13Hint, d13Pretty, type D13Answer, type D13Prompt } from './logic';
import styles from './ContextPanel.module.css';

/** The twelve half steps from C, sharps and flats both, for counting. */
const CHROMATIC = ['C', 'C#/Db', 'D', 'D#/Eb', 'E', 'F', 'F#/Gb', 'G', 'G#/Ab', 'A', 'A#/Bb', 'B'];

/**
 * D13's context panel (design §7): how a capo works and the chromatic scale
 * to count on. The session hides it at guide level 0; from level 2 it adds
 * the reverse rule, so both directions sit side by side (research/02 rule 6).
 * It names the method, never the answer.
 */
export function CapoContextPanel({
  prompt,
  guideLevel,
  guided,
}: DrillContextPanelProps<D13Prompt, D13Answer>) {
  // The worked example shows full guides (design §3.3 step 2).
  const level = guided ? 3 : guideLevel;
  return (
    <div className={styles.panel}>
      <h2>How a capo works</h2>
      <p>
        A capo on fret <strong>n</strong> raises every shape <strong>n</strong> half steps. You
        finger the same shapes; they sound higher.
      </p>
      {level >= 2 && (
        <p>
          Shapes → sounding key: count <strong>up</strong>. Song → shapes: count{' '}
          <strong>down</strong>.
        </p>
      )}
      <p>{d13Hint(prompt)}</p>
      <ol className={styles.chromatic} aria-label="The twelve half steps">
        {CHROMATIC.map((n) => (
          <li key={n}>{n.split('/').map(d13Pretty).join('/')}</li>
        ))}
      </ol>
    </div>
  );
}
