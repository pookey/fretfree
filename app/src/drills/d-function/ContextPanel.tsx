import type { DrillContextPanelProps } from '../types';
import type { DfAnswer, DfPrompt } from './logic';
import { dfHint, dfReference } from './text';
import styles from './ContextPanel.module.css';

const TITLE: Record<DfPrompt['kind'], string> = {
  'minor-chord': 'Minor-key harmony',
  'minor-source': 'Minor-key harmony',
  'two-five': 'Minor-key harmony',
  function: 'Chord function',
  secondary: 'Secondary dominants',
  'secondary-of': 'Secondary dominants',
  borrowed: 'Borrowed chords',
  'tritone-sub': 'Substitutes',
};

/**
 * The function drill's context panel (design §7), faded by guide level
 * (rule 9): level 1 names the method, and levels 2 and 3 add what to check
 * the cue against (scales, the key's chords). It never names the answer
 * (rule 4). The session hides the panel at level 0.
 */
export function FunctionContextPanel({
  prompt,
  guideLevel,
  guided,
}: DrillContextPanelProps<DfPrompt, DfAnswer>) {
  // The worked example shows full guides (design §3.3 step 2).
  const level = guided ? 3 : guideLevel;
  return (
    <div className={styles.panel}>
      <h2>{TITLE[prompt.kind]}</h2>
      {level >= 1 && <p>{dfHint(prompt)}</p>}
      {dfReference(prompt, level).map((r) => (
        <p key={r.label}>
          {r.label}: <strong>{r.value}</strong>
        </p>
      ))}
    </div>
  );
}
