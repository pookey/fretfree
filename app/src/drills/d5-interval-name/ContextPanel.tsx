import type { GuideLevel } from '../../engine/model';
import type { DrillContextPanelProps } from '../types';
import { IntervalLegend } from './IntervalLegend';
import { d5LineLegend, type D5Answer, type D5Prompt } from './logic';
import styles from './ContextPanel.module.css';

/**
 * D5's context panel (design §6 D5, §7): the interval legend for the prompt's
 * choices, faded with the guides. The answer is marked only once the learner
 * has answered.
 */
export function IntervalContextPanel({
  prompt,
  guideLevel,
  guided,
  feedback,
}: DrillContextPanelProps<D5Prompt, D5Answer>) {
  // The worked example shows full guides (design §3.3 step 2).
  const level: GuideLevel = guided ? 3 : guideLevel;
  return (
    <div
      className={
        d5LineLegend(prompt.choices.length) ? `${styles.panel} ${styles.wide}` : styles.panel
      }
    >
      <h2>Intervals</h2>
      <IntervalLegend
        choices={prompt.choices}
        guideLevel={level}
        gbShift={prompt.gbShift}
        {...(feedback
          ? {
              expected: prompt.interval,
              ...(feedback.result.correct ? {} : { given: feedback.answer }),
            }
          : {})}
      />
    </div>
  );
}
