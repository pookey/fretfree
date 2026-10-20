import { ENGINE_CONFIG } from '../../engine/config';
import type { GuideLevel } from '../../engine/model';
import type { DrillContextPanelProps } from '../types';
import type { D20Answer, D20Prompt } from './logic';
import styles from './ContextPanel.module.css';

/**
 * D20's context panel (design §7): how to count the bar, and for a
 * strumming pattern how the arm moves. The counting fades with the guides
 * (rule 9); the session hides the whole panel at guide level 0.
 */
export function RhythmPanel({
  prompt,
  guideLevel,
  guided,
}: DrillContextPanelProps<D20Prompt, D20Answer>) {
  const level: GuideLevel = guided ? 3 : guideLevel;
  return (
    <div className={styles.panel}>
      <h2>Counting</h2>
      {level >= ENGINE_CONFIG.rhythm.countGuideLevel && (
        <p data-testid="d20-counting">
          Count “1 & 2 & 3 & 4 &” under your breath. The numbers land on the clicks, and each “&”
          halfway between them.
        </p>
      )}
      <p>
        A bar of four clicks counts you in. Then play the rhythm {prompt.bars} times through, at{' '}
        {prompt.bpm} beats a minute.
      </p>
      {prompt.kind === 'strum' && (
        <p>
          Strum down on the numbers and up on the “&”s. Keep the arm swinging all the time, even
          through the gaps: it just misses the strings.
        </p>
      )}
    </div>
  );
}
