import type { DrillContextPanelProps } from '../types';
import type { D29Answer, D29Prompt } from './logic';
import { d29Guides } from './text';
import styles from './ContextPanel.module.css';

/**
 * D29's context panel (design §7): how a bar of simple or compound time is
 * built. It never names a bar's fill (research/02 rule 4): the learner
 * applies the rule.
 */
export function CompleteBarContextPanel({
  guideLevel,
  guided,
}: DrillContextPanelProps<D29Prompt, D29Answer>) {
  // The worked example shows full guides (design §3.3 step 2).
  const guides = d29Guides(guided ? 3 : guideLevel);
  return (
    <div className={styles.panel}>
      <h2>Filling a bar</h2>
      {guides.rules.map((rule) => (
        <p key={rule}>{rule}</p>
      ))}
    </div>
  );
}
