import { ChordDiagram } from '../../components/chord-diagram/ChordDiagram';
import { chordFormula, chordToneOf, type ChordDegree } from '../../theory';
import type { DrillContextPanelProps } from '../types';
import { d8DiagramVoicing } from './diagram';
import {
  d8DegreeLabel,
  d8DegreeSpoken,
  d8DegreeStyle,
  d8Display,
  d8ShowsRoots,
  type D8Answer,
  type D8Prompt,
} from './logic';
import styles from './ContextPanel.module.css';

/** The marker each degree is drawn with in feedback: the same shapes as the neck. */
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
 * D8's context panel (design §7): the current chord diagram beside the
 * chord's formula, root first, with the marker shape each degree takes in
 * feedback. It fades with the guides (rule 9): from level 2 each degree's
 * note is named too. The asked degree is marked, and the diagram's dots
 * labelled by degree, only once the learner has answered, or in a worked
 * example, so the panel never answers a recall prompt (rule 4). The panel
 * loads on first use, outside first-load JS (`drill.ts`).
 */
export function ChordTonePanel({
  prompt,
  guideLevel,
  guided,
  handedness,
  tuning,
  feedback,
}: DrillContextPanelProps<D8Prompt, D8Answer>) {
  const chord = d8Display(prompt.chord);
  const showAnswer = Boolean(feedback) || guided;
  return (
    <div className={styles.panel} data-testid="chord-tone-panel">
      <div className={styles.diagram}>
        <ChordDiagram
          voicing={d8DiagramVoicing(prompt, showAnswer)}
          tuning={tuning}
          handedness={handedness}
          dotText={showAnswer ? 'label' : 'none'}
          highlightRoots={showAnswer || d8ShowsRoots(prompt, guideLevel, guided)}
          guideLevel={showAnswer ? 3 : guideLevel}
        />
      </div>
      <div className={styles.text}>
        <h2>Chord tones of {chord}</h2>
        <ul className={styles.tones} aria-label={`Chord tones of ${chord}`}>
          {chordFormula(prompt.kind).map((degree) => (
            <li
              key={degree}
              className={styles.tone}
              aria-current={showAnswer && degree === prompt.degree ? 'true' : undefined}
            >
              <DegreeIcon degree={degree} />
              <strong aria-label={d8DegreeSpoken(degree)}>{d8DegreeLabel(degree)}</strong>
              {guideLevel >= 2 && (
                <span className={styles.note}>
                  {d8Display(chordToneOf(prompt.root, prompt.kind, degree) as string)}
                </span>
              )}
            </li>
          ))}
        </ul>
        {guideLevel >= 3 && d8ShowsRoots(prompt, guideLevel, guided) && (
          <p>Count up from a root square: the 3rds sit nearby, the 5th a string or two away.</p>
        )}
      </div>
    </div>
  );
}
