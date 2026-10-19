import type { DrillContextPanelProps } from '../types';
import { d6IntervalName, d6Semitones, type D6Answer, type D6Prompt } from './logic';
import styles from './ContextPanel.module.css';

/**
 * D6's context panel (design §6 D6, §7): the interval's size in frets, and
 * from level 2 the G–B rule. It names the interval the prompt already asks
 * for, never where it lands.
 */
export function IntervalTapContextPanel({
  prompt,
  guideLevel,
  guided,
}: DrillContextPanelProps<D6Prompt, D6Answer>) {
  // The worked example shows full guides (design §3.3 step 2).
  const level = guided ? 3 : guideLevel;
  const name = d6IntervalName(prompt.interval);
  return (
    <div className={styles.panel}>
      <h2>{name.charAt(0).toUpperCase() + name.slice(1)}</h2>
      <p>
        {d6Semitones(prompt)} half steps: {d6Semitones(prompt)} frets along one string.
      </p>
      {level >= 2 && (
        <p>
          Shapes that cross the <strong>G and B</strong> strings move up 1 fret: that pair is a
          major 3rd apart, where every other pair is a 4th.
        </p>
      )}
    </div>
  );
}
