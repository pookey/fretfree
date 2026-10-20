import { ChordDiagram, voicingFromShape } from '../../components/chord-diagram';
import type { GuideLevel } from '../../engine/model';
import { STANDARD_TUNING } from '../../theory';
import { d9ChordSymbol, d9Display } from '../d9-build-caged/logic';
import type { DrillContextPanelProps } from '../types';
import {
  d21FretLine,
  d21Noun,
  d21OpenShape,
  d21ShapeAt,
  d21Subject,
  type D21Answer,
  type D21Prompt,
} from './logic';
import styles from './ContextPanel.module.css';

/**
 * D21's context panel: how to picture the shape (rule 8, worked example →
 * faded). The session hides it at guide level 0. From level 1 it gives the
 * method in three steps, none of which says where the notes are. At level 3
 * it also draws the shape in open position with plain dots, the picture to
 * slide up the neck: the learner still finds the asked notes in it. Once
 * answered (or in the worked example) it draws the shape where it was asked,
 * by degree, from level 2.
 */
export function PicturePanel({
  prompt,
  guideLevel,
  guided,
  handedness,
  tuning,
  feedback,
}: DrillContextPanelProps<D21Prompt, D21Answer>) {
  // The worked example shows full guides (design §3.3 step 2).
  const level: GuideLevel = guided ? 3 : guideLevel;
  const answered = Boolean(feedback) || guided;
  const open = d21OpenShape(prompt);
  const openName = `${d9Display(d9ChordSymbol(prompt.shape, prompt.quality))}`;
  return (
    <div className={styles.panel}>
      <h2>Picture it</h2>
      <ol className={styles.steps}>
        <li>See the open {openName} chord shape.</li>
        {prompt.position > 0 && (
          <li>Slide it up until its lowest fret is fret {prompt.position}.</li>
        )}
        <li>Find every {d21Noun(prompt)} in it, then tap them.</li>
      </ol>
      {answered && level >= 2 ? (
        <ChordDiagram
          className={styles.diagram}
          voicing={voicingFromShape({ notes: prompt.shapeNotes })}
          tuning={tuning}
          handedness={handedness}
          name={d9Display(prompt.chord)}
          dotText="label"
          label={`${d21Subject(prompt)}: ${d21FretLine(prompt.shapeNotes)}`}
        />
      ) : (
        !answered &&
        level >= 3 &&
        open.length > 0 && (
          <ChordDiagram
            className={styles.diagram}
            voicing={{
              notes: open.map((n) => ({ string: n.string, fret: n.fret, style: 'tone' })),
            }}
            tuning={STANDARD_TUNING}
            handedness={handedness}
            highlightRoots={false}
            guideLevel={0}
            label={`The ${openName} shape in open position: ${d21FretLine(open)}. Picture ${d21ShapeAt(prompt)}.`}
          />
        )
      )}
    </div>
  );
}
