import type { DrillContextPanelProps } from '../types';
import { d22At } from '../d22-staff-name/logic';
import { d24OpenStrings, type D24Answer, type D24Prompt } from './logic';
import styles from './ContextPanel.module.css';

/**
 * D24's context panel: how to get from a fret to the staff, fading with the
 * guide level (research/02 rule 9; the session hides it at level 0).
 *
 * | Level | Shows |
 * |---|---|
 * | 3 | the open strings' places, the lines and spaces, and how frets step |
 * | 2 | the open strings' places, and the lines and spaces |
 * | 1 | two anchors: the G string on the G line, and open low E |
 *
 * It names the anchors a fret is counted up from, never the lit cell's note.
 */
export function FretToStaffContextPanel({
  guideLevel,
  tuning,
}: DrillContextPanelProps<D24Prompt, D24Answer>) {
  return (
    <div className={styles.panel}>
      <h2>From the fret to the staff</h2>
      {guideLevel >= 2 ? (
        <>
          <p>The open strings on the staff:</p>
          <ul>
            {d24OpenStrings(tuning).map((s) => (
              <li key={s.string}>
                String {s.string}, <strong>{s.note.replace(/\d+$/, '')}</strong>: {d22At(s.place)}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p>
          The open <strong>G</strong> string is the G line the clef curls round (line 2). Open low{' '}
          <strong>E</strong> hangs under three ledger lines.
        </p>
      )}
      {guideLevel >= 2 && (
        <p>
          Lines, bottom up: <strong>E G B D F</strong>. Spaces: <strong>F A C E</strong>.
        </p>
      )}
      {guideLevel >= 3 && (
        <p>
          Each fret is a half step. Naturals are two frets apart, except <strong>B–C</strong> and{' '}
          <strong>E–F</strong>, one fret apart: one step up the staff either way.
        </p>
      )}
      {guideLevel >= 2 && (
        <p className={styles.note}>Guitar music sounds an octave lower than it is written.</p>
      )}
    </div>
  );
}
