import type { DrillContextPanelProps } from '../types';
import { d12KeyChords, pretty, type D12Answer, type D12Prompt } from './logic';
import styles from './ContextPanel.module.css';

/**
 * D12's context panel (design §6 D12, §7): the progression and where it is
 * heard, the rotation note for I–V–vi–IV and vi–IV–I–V (the C9
 * misconception), and from level 2 the key's chords by numeral, named once
 * answered or at full guides (research/02 rule 4). A transposition's
 * progression is part of its answer, so it is named from level 2.
 */
export function ProgressionContextPanel({
  prompt,
  guideLevel,
  guided,
  feedback,
}: DrillContextPanelProps<D12Prompt, D12Answer>) {
  // The worked example shows full guides (design §3.3 step 2).
  const level = guided ? 3 : guideLevel;
  const answered = Boolean(feedback) || guided;
  const named = prompt.task === 'build' || level >= 2 || answered;
  const reveal = answered || level >= 3;
  return (
    <div className={styles.panel}>
      <h2>Progression</h2>
      {named ? (
        <p>
          <strong>{prompt.name}</strong>: {prompt.description}
        </p>
      ) : (
        <p>Each chord keeps its numeral when the chart moves key.</p>
      )}
      {named && prompt.rotations.length > 0 && (
        <p data-testid="d12-rotation-note">
          <strong>{[prompt.name, ...prompt.rotations].join(' and ')}</strong> are rotations: the
          same chords, started from a different chord.
        </p>
      )}
      {level >= 2 && (
        <ol
          className={styles.chords}
          aria-label={reveal ? `Chords in ${prompt.keyName}` : 'Chords in the key, by numeral'}
          data-testid="d12-key-chords"
        >
          {d12KeyChords(prompt).map((c) => (
            <li key={c.roman}>
              <span className={styles.roman}>{pretty(c.roman)}</span>
              {reveal && <span className={styles.symbol}>{pretty(c.symbol)}</span>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
