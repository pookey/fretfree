import { ENGINE_CONFIG } from '../../engine/config';
import type { VoiceLeadChord } from '../../engine/items/voice-lead';
import type { GuideLevel } from '../../engine/model';
import type { DrillContextPanelProps } from '../types';
import { d18Display, d18Tone } from '../d18-inversions/logic';
import {
  D19_CHORDS,
  d19Chord,
  d19MoveLine,
  d19Moves,
  d19Rule,
  type D19Answer,
  type D19Prompt,
} from './logic';
import styles from './ContextPanel.module.css';

function spelling(prompt: D19Prompt, chord: VoiceLeadChord): string {
  return (['R', '3', '5'] as const).map((d) => d18Tone(prompt.roots[chord], 'major', d)).join(' ');
}

/**
 * D19's context panel (design §7). It lists I, IV and V in the prompt's key,
 * tagging the chord the triad moves from and the one it moves to; each
 * chord's notes show from guide level 2 (rule 9: the spelling fades with the
 * guides). Once answered it lists how each voice moves; before that, at full
 * guides, it states the rule.
 */
export function VoiceLeadingPanel({
  prompt,
  guideLevel,
  guided,
  feedback,
}: DrillContextPanelProps<D19Prompt, D19Answer>) {
  // The worked example shows full guides (design §3.3 step 2).
  const level: GuideLevel = guided ? 3 : guideLevel;
  const answered = Boolean(feedback) || guided;
  const spelled = answered || level >= ENGINE_CONFIG.voiceLeading.spellingGuideLevel;
  const role = (c: VoiceLeadChord) =>
    c === prompt.from ? 'from' : c === prompt.to ? 'to' : undefined;
  return (
    <div className={styles.panel}>
      <h2>I–IV–V in {d18Display(prompt.key)}</h2>
      <ol className={styles.chords} aria-label="Chords">
        {D19_CHORDS.map((c) => (
          <li key={c} data-role={role(c)} aria-current={c === prompt.to ? 'step' : undefined}>
            <span className={styles.numeral}>{c}</span>
            <span className={styles.chord}>{d19Chord(prompt, c)}</span>
            {spelled && <span className={styles.notes}>{spelling(prompt, c)}</span>}
            {role(c) && <span className={styles.role}>{role(c)}</span>}
          </li>
        ))}
      </ol>
      {answered ? (
        <ul className={styles.moves} aria-label="Moves" data-testid="d19-moves">
          {d19Moves(prompt).map((m) => (
            <li key={m.string}>
              <span className={styles.string}>String {m.string}</span> {d19MoveLine(prompt, m)}
            </li>
          ))}
        </ul>
      ) : (
        level >= 3 && <p>{d19Rule(prompt)}</p>
      )}
    </div>
  );
}
