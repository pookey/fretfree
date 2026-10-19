import type { DrillContextPanelProps } from '../types';
import type { D39Answer, D39Prompt } from './logic';
import styles from './ContextPanel.module.css';

/**
 * D39's context panel (design §6 D39, §7): where the fret markers sit, and
 * from level 2 the 12th-fret repeat.
 */
export function LandmarksContextPanel({
  guideLevel,
  guided,
}: DrillContextPanelProps<D39Prompt, D39Answer>) {
  // The worked example shows full guides (design §3.3 step 2).
  const level = guided ? 3 : guideLevel;
  return (
    <div className={styles.panel}>
      <h2>Fret markers</h2>
      <p>
        Single dots at <strong>3, 5, 7 and 9</strong>. A double dot at <strong>12</strong>.
      </p>
      {level >= 2 && (
        <p>
          At the 12th fret every string sounds its open note an octave up, and the pattern starts
          again: each fret repeats 12 frets higher.
        </p>
      )}
    </div>
  );
}
