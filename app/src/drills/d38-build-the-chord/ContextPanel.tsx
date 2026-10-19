import type { DrillContextPanelProps } from '../types';
import {
  d38DegreeLabel,
  d38DegreeSpoken,
  d38DegreeStyle,
  d38Display,
  d38ShowsFormula,
  d38ShowsNotes,
  type D38Answer,
  type D38Prompt,
} from './logic';
import styles from './ContextPanel.module.css';

/** The marker each degree is drawn with in feedback: the same shapes as the neck. */
function DegreeIcon({ degree }: { degree: string }) {
  const style = d38DegreeStyle(degree);
  return (
    <svg className={`${styles.icon} ${styles[style]}`} viewBox="0 0 20 20" aria-hidden="true">
      {style === 'root' && <rect x={2} y={2} width={16} height={16} rx={3} />}
      {style === 'third' && <circle cx={10} cy={10} r={8} />}
      {style === 'fifth' && <polygon points="10,1 19,18 1,18" />}
      {style === 'seventh' && <polygon points="19,10 14.5,17.8 5.5,17.8 1,10 5.5,2.2 14.5,2.2" />}
    </svg>
  );
}

/**
 * D38's context panel (design §7): what makes a voicing count, and the
 * chord's tones with the marker shape each takes in feedback. It fades with
 * the guides (rule 9): the formula shows from level 2 and the notes from
 * level 3; below that, spelling the chord is part of the recall (rule 4).
 * After the check, or in a worked example, it shows everything. The panel
 * loads on first use, outside first-load JS (`drill.ts`).
 */
export function BuildChordPanel({
  prompt,
  guideLevel,
  guided,
  feedback,
}: DrillContextPanelProps<D38Prompt, D38Answer>) {
  const chord = d38Display(prompt.chord);
  const answered = Boolean(feedback);
  const formula = answered || d38ShowsFormula(guideLevel, guided);
  const notes = answered || d38ShowsNotes(guideLevel, guided);
  return (
    <div className={styles.panel} data-testid="build-chord-panel">
      <h2>Build {chord}</h2>
      {formula ? (
        <ul className={styles.tones} aria-label={`Chord tones of ${chord}`}>
          {prompt.tones.map((t) => (
            <li key={t.degree} className={styles.tone} data-optional={!t.required || undefined}>
              <DegreeIcon degree={t.degree} />
              <strong aria-label={d38DegreeSpoken(t.degree)}>{d38DegreeLabel(t.degree)}</strong>
              {notes && <span className={styles.note}>{d38Display(t.name)}</span>}
              {!t.required && <span className={styles.optional}>optional</span>}
            </li>
          ))}
        </ul>
      ) : (
        <p>Spell {chord} from its root, then find each tone above the root.</p>
      )}
      <ul className={styles.rules}>
        <li>Every chord tone{prompt.tones.some((t) => !t.required) ? ' (the 5th may go)' : ''}</li>
        <li>No other notes</li>
        <li>
          Within {prompt.maxSpan} frets, {prompt.maxFingers} fingers
        </li>
      </ul>
    </div>
  );
}
