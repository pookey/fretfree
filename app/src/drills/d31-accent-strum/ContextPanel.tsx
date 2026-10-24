import { ENGINE_CONFIG } from '../../engine/config';
import type { GuideLevel } from '../../engine/model';
import type { DrillContextPanelProps } from '../types';
import type { D31Answer, D31Prompt } from './logic';
import styles from './ContextPanel.module.css';

/**
 * D31's context panel (design §7): how to count the bar and play its
 * accents, and why the click fades. The count fades with the guides (rule
 * 9); the session hides the whole panel at guide level 0.
 */
export function AccentPanel({
  prompt,
  guideLevel,
  guided,
}: DrillContextPanelProps<D31Prompt, D31Answer>) {
  const level: GuideLevel = guided ? 3 : guideLevel;
  const beats = prompt.beatStarts.length;
  return (
    <div className={styles.panel}>
      <h2>Counting</h2>
      {level >= ENGINE_CONFIG.accentStrum.syllableGuideLevel && (
        <p data-testid="d31-counting">
          Count <span className={styles.count}>“{prompt.syllables.join(' ')}”</span> under your
          breath. The numbers are the {beats} beats of the bar.
        </p>
      )}
      <p>
        Play the marked (&gt;) strokes strong and the rest soft, so the bar’s shape comes through.
      </p>
      <h2>The click</h2>
      <p>
        A bar of clicks counts you in. Then play the bar {prompt.bars} times. While you keep time,
        the click drops out bar by bar, so you carry the beat yourself; if you slip, it comes back.
      </p>
    </div>
  );
}
