import type { DrillContextPanelProps } from '../types';
import { d7Hint, type D7Answer, type D7Prompt } from './logic';
import styles from './ContextPanel.module.css';

/**
 * D7's context panel (design §6 D7, §7): the major-scale step pattern or the
 * chord's formula, the subject's hint, and from level 2 the half-step rule.
 */
export function SpellingContextPanel({
  prompt,
  guideLevel,
  guided,
}: DrillContextPanelProps<D7Prompt, D7Answer>) {
  // The worked example shows full guides (design §3.3 step 2).
  const level = guided ? 3 : guideLevel;
  return (
    <div className={styles.panel}>
      <h2>{prompt.kind === 'chord' ? 'Chord formula' : 'Major scale'}</h2>
      {prompt.kind === 'chord' ? (
        <p>
          <strong>{prompt.subject}</strong> = {prompt.slots.map((s) => s.label).join(' ')}
        </p>
      ) : (
        <p>
          Steps from the tonic: <strong>W W H W W W H</strong>
        </p>
      )}
      <p>{d7Hint(prompt)}</p>
      {level >= 2 && (
        <p>
          No sharp between <strong>B–C</strong> and <strong>E–F</strong>: they are a half step
          apart.
        </p>
      )}
    </div>
  );
}
