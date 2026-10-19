import type { ChordDegree } from '../../theory';
import type { DrillContextPanelProps } from '../types';
import { d8DegreeLabel, d8DegreeSpoken, d8DegreeStyle, d8Display } from '../d8-chord-tone/logic';
import { d37Asked, d37ChordName, type D37Answer, type D37Prompt } from './logic';
import styles from './ContextPanel.module.css';

/** The marker each degree is drawn with on the neck: the explorer's shapes and colours. */
function DegreeIcon({ degree }: { degree: ChordDegree }) {
  const style = d8DegreeStyle(degree);
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
 * D37's context panel (design §7): the chord's formula, root first, with the
 * marker each degree takes on the neck, so a found note reads at a glance.
 * It fades with the guides (rule 9): from level 2 each degree's note is
 * named too. The asked degrees are marked once answered, or in a worked
 * example, and the CAGED shape a region came from is named then.
 */
export function ChordTonesPanel({
  prompt,
  guideLevel,
  guided,
  feedback,
}: DrillContextPanelProps<D37Prompt, D37Answer>) {
  const chord = d37ChordName(prompt);
  const showAnswer = Boolean(feedback) || guided;
  const asked = d37Asked(prompt);
  return (
    <div className={styles.panel} data-testid="chord-tones-panel">
      <h2>Chord tones of {chord}</h2>
      <ul className={styles.tones} aria-label={`Chord tones of ${chord}`}>
        {prompt.tones.map((t) => (
          <li
            key={t.degree}
            className={styles.tone}
            aria-current={showAnswer && asked.includes(t.degree) ? 'true' : undefined}
          >
            <DegreeIcon degree={t.degree} />
            <strong aria-label={d8DegreeSpoken(t.degree)}>{d8DegreeLabel(t.degree)}</strong>
            {guideLevel >= 2 && <span className={styles.note}>{d8Display(t.name)}</span>}
          </li>
        ))}
      </ul>
      {showAnswer && prompt.shape && (
        <p>
          These frets are the {prompt.shape.name} shape of {chord}.
        </p>
      )}
    </div>
  );
}
