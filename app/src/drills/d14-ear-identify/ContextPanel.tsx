import type { DrillContextPanelProps } from '../types';
import type { D14Answer, D14Prompt } from './logic';
import { d14Guide } from './text';
import styles from './ContextPanel.module.css';

const HEADING = {
  interval: 'Interval sizes',
  chord: 'Chord qualities',
  progression: 'Progressions',
} as const;

/**
 * D14's context panel (design §7): what each button's sound is, from guide
 * level 1 (an interval's half steps, a chord's formula, a progression's
 * numerals), and from level 2 what to listen for (a song that opens with a
 * rising interval, a chord's character). It lists every button alike, so it
 * never singles out the answer (research/02 rule 4), and fades with the
 * guides (rule 9).
 */
export function EarContextPanel({
  prompt,
  guideLevel,
  guided,
}: DrillContextPanelProps<D14Prompt, D14Answer>) {
  // The worked example shows full guides (design §3.3 step 2).
  const rows = d14Guide(prompt, guided ? 3 : guideLevel);
  return (
    <div className={styles.panel}>
      <h2>{HEADING[prompt.kind]}</h2>
      <dl>
        {rows.map((r) => (
          <div key={r.choice} className={styles.row}>
            <dt>{r.name}</dt>
            <dd>
              {r.detail}
              {r.cue && <span className={styles.cue}>{r.cue}</span>}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
