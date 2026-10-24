import type { DrillContextPanelProps } from '../types';
import type { D25Answer, D25Prompt } from './logic';
import { D25_METHOD, D25_RULE, d25Guides } from './text';
import styles from './ContextPanel.module.css';

/**
 * D25's context panel (design §7): that a signature holds in every octave,
 * from level 2 the orders of sharps and flats, and at level 3 how to read a
 * signature off them. It never names the signature's letters or the answer
 * (research/02 rule 4): reading them off the staff is the task.
 */
export function KeySignatureApplyContextPanel({
  guideLevel,
  guided,
}: DrillContextPanelProps<D25Prompt, D25Answer>) {
  // The worked example shows full guides (design §3.3 step 2).
  const guides = d25Guides(guided ? 3 : guideLevel);
  return (
    <div className={styles.panel}>
      <h2>Key signature</h2>
      {guides.rule && <p>{D25_RULE}</p>}
      {guides.orders && (
        <p>
          Sharps: <strong>F C G D A E B</strong>. Flats: <strong>B E A D G C F</strong>.
        </p>
      )}
      {guides.method && <p>{D25_METHOD}</p>}
    </div>
  );
}
