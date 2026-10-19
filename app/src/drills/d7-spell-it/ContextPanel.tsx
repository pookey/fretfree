import { DiatonicChords } from '../../session/context/DiatonicChords';
import type { DrillContextPanelProps } from '../types';
import { d7Hint, type D7Answer, type D7Prompt } from './logic';
import styles from './ContextPanel.module.css';

/**
 * D7's context panel (design §6 D7, §7): the major-scale step pattern or the
 * chord's formula, the subject's hint, and from level 2 the half-step rule.
 * A key's panel adds its diatonic chords (design §7 "the key and its diatonic
 * chords"): the numerals from level 2, named once answered, since the chords'
 * roots spell the scale (research/02 rule 4).
 */
export function SpellingContextPanel({
  prompt,
  guideLevel,
  guided,
  feedback,
}: DrillContextPanelProps<D7Prompt, D7Answer>) {
  // The worked example shows full guides (design §3.3 step 2).
  const level = guided ? 3 : guideLevel;
  const answered = Boolean(feedback) || guided;
  return (
    <div className={styles.panel}>
      <h2>{prompt.kind === 'chord' ? 'Chord formula' : 'Major scale'}</h2>
      {prompt.kind === 'chord' ? (
        <p>
          <strong>{prompt.subject}</strong> = {prompt.slots.map((s) => s.label).join(' ')}
        </p>
      ) : (
        // One paragraph with the hint, so the key's chords fit above an iPad mini's neck.
        <p>
          Steps from the tonic: <strong>W W H W W W H</strong>. {d7Hint(prompt)}
        </p>
      )}
      {prompt.kind === 'chord' && <p>{d7Hint(prompt)}</p>}
      {level >= 2 && (
        <p>
          No sharp between <strong>B–C</strong> and <strong>E–F</strong>: they are a half step
          apart.
        </p>
      )}
      {prompt.kind !== 'chord' && (level >= 2 || answered) && (
        <DiatonicChords tonic={prompt.tonic} reveal={answered} />
      )}
    </div>
  );
}
