import type { DrillContextPanelProps } from '../types';
import {
  FLAT_KEY_ORDER,
  SHARP_KEY_ORDER,
  d40Guides,
  type D40Answer,
  type D40Prompt,
} from './logic';
import styles from './ContextPanel.module.css';

/**
 * D40's context panel (design §7): the rule for the kind of card, the orders
 * of sharps and flats, and from level 2 the keys in circle order, so the
 * learner can count round. It never names the answer (research/02 rule 4),
 * and the V's panel never lists the keys in order, which would be its answer.
 */
export function KeySignatureContextPanel({
  prompt,
  guideLevel,
  guided,
}: DrillContextPanelProps<D40Prompt, D40Answer>) {
  // The worked example shows full guides (design §3.3 step 2).
  const guides = d40Guides(prompt.kind, guided ? 3 : guideLevel);
  return (
    <div className={styles.panel}>
      <h2>Circle of fifths</h2>
      {guides.rule && <p>{guides.rule}</p>}
      {guides.orders && (
        <p>
          Sharps: <strong>F C G D A E B</strong>. Flats: <strong>B E A D G C F</strong>.
        </p>
      )}
      {guides.circle && (
        <>
          <p>
            Sharp keys: <strong>{SHARP_KEY_ORDER.join(' ')}</strong>
          </p>
          <p>
            Flat keys: <strong>{FLAT_KEY_ORDER.join(' ')}</strong>
          </p>
        </>
      )}
    </div>
  );
}
