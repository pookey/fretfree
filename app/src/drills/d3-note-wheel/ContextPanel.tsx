import type { GuideLevel } from '../../engine/model';
import type { DrillContextPanelProps } from '../types';
import { NoteWheel } from './NoteWheel';
import { d3AnswerPc, type D3Answer, type D3Prompt } from './logic';
import styles from './ContextPanel.module.css';

/**
 * D3's context panel (design §6 D3, §7): the note wheel beside the half-step
 * rule, so it stays short above the neck on an iPad in landscape. The answer
 * is marked on the wheel only once the learner has answered.
 */
export function NoteWheelContextPanel({
  prompt,
  guideLevel,
  guided,
  feedback,
}: DrillContextPanelProps<D3Prompt, D3Answer>) {
  // The worked example shows full guides (design §3.3 step 2).
  const level: GuideLevel = guided ? 3 : guideLevel;
  const given = feedback ? d3AnswerPc(feedback.answer) : null;
  // "E–F" would answer "the note after E?": below level 3 a musical-alphabet
  // prompt gets the rule only once it is answered.
  const showRule = level >= 3 || (level >= 2 && (prompt.kind === 'step' || feedback !== null));
  return (
    <div className={styles.panel}>
      <h2>Note wheel</h2>
      <NoteWheel
        guideLevel={level}
        pref={prompt.pref}
        start={prompt.from}
        {...(feedback
          ? {
              expected: prompt.expectedPc,
              ...(feedback.result.correct || !given ? {} : { given }),
            }
          : {})}
      />
      {showRule && (
        <p>
          No sharp between <strong>B–C</strong> and <strong>E–F</strong>: they are a half step
          apart. Every other pair of neighbours in the musical alphabet is a whole step.
        </p>
      )}
      {level >= 3 && <p>On one string, a half step is one fret and a whole step is two.</p>}
    </div>
  );
}
