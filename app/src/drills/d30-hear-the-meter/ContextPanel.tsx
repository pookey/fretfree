import type { DrillContextPanelProps } from '../types';
import type { D30Answer, D30Prompt } from './logic';
import { d30Guide } from './text';
import styles from './ContextPanel.module.css';

/**
 * D30's context panel (design §7): how each button's meter is counted, from
 * guide level 1, and from level 2 what to listen for. It lists every button
 * alike, so it never singles out the answer (research/02 rule 4), and fades
 * with the guides (rule 9).
 */
export function MeterContextPanel({
  prompt,
  guideLevel,
  guided,
}: DrillContextPanelProps<D30Prompt, D30Answer>) {
  // The worked example shows full guides (design §3.3 step 2).
  const rows = d30Guide(prompt, guided ? 3 : guideLevel);
  return (
    <div className={styles.panel}>
      <h2>Meters</h2>
      <dl>
        {rows.map((r) => (
          <div key={r.meter} className={styles.row}>
            <dt>{r.meter}</dt>
            <dd>
              {r.count}
              {r.cue && <span className={styles.cue}>{r.cue}</span>}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
