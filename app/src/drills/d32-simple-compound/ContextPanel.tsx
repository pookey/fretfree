import type { DrillContextPanelProps } from '../types';
import { type D32Answer, type D32Prompt } from './logic';
import { d32Guides } from './text';
import styles from './ContextPanel.module.css';

/**
 * D32's context panel (design §7): the rules for simple and compound time,
 * and from level 2 how each kind of beat is counted. It never names a
 * card's answer (research/02 rule 4): the learner applies the rule.
 */
export function SimpleCompoundContextPanel({
  guideLevel,
  guided,
}: DrillContextPanelProps<D32Prompt, D32Answer>) {
  // The worked example shows full guides (design §3.3 step 2).
  const guides = d32Guides(guided ? 3 : guideLevel);
  return (
    <div className={styles.panel}>
      <h2>Time signatures</h2>
      {guides.rules.map((rule) => (
        <p key={rule}>{rule}</p>
      ))}
      {guides.counting && (
        <p>
          Count simple beats in two: <strong>1 & 2 &</strong>. Count compound beats in three:{' '}
          <strong>1 la li 2 la li</strong>.
        </p>
      )}
    </div>
  );
}
