import type { GuideLevel } from '../../engine/model';
import styles from './ContextPanel.module.css';

/**
 * D22's context panel: how to find a note's name on the staff, fading with
 * the guide level (research/02 rule 9; the session hides it at level 0).
 *
 * | Level | Shows |
 * |---|---|
 * | 3 | the lines and spaces, and the steps out past the staff |
 * | 2 | the lines and spaces |
 * | 1 | the two anchors: the G line and open low E |
 *
 * Letters only, never octave numbers: the place is what the learner reads.
 */
export function StaffNameContextPanel({ guideLevel }: { guideLevel: GuideLevel }) {
  return (
    <div className={styles.panel}>
      <h2>Reading the staff</h2>
      {guideLevel >= 2 && (
        <>
          <p>
            Lines, bottom up: <strong>E G B D F</strong>
          </p>
          <p>
            Spaces, bottom up: <strong>F A C E</strong>
          </p>
        </>
      )}
      {guideLevel >= 3 && (
        <>
          <p>
            Below the staff, stepping down: <strong>D C B A G F E</strong>. Low E hangs under three
            ledger lines.
          </p>
          <p>
            Above it, stepping up: <strong>G A B C D E F</strong>.
          </p>
        </>
      )}
      {guideLevel === 1 && (
        <p>
          The clef curls round the <strong>G line</strong> (line 2). The open low <strong>E</strong>{' '}
          hangs under three ledger lines.
        </p>
      )}
      {guideLevel >= 2 && (
        <p className={styles.note}>Guitar music sounds an octave lower than it is written.</p>
      )}
    </div>
  );
}
