import type { DrillContextPanelProps } from '../types';
import type { D24Answer, D24Prompt } from './logic';
import styles from './ContextPanel.module.css';

/**
 * D24's context panel: how to get from a fret to the staff, fading with the
 * guide level (research/02 rule 9; the session hides it at level 0).
 *
 * | Level | Shows |
 * |---|---|
 * | 3 | the clef's G line, the lines and spaces, counting frets, and how naturals step |
 * | 2 | the clef's G line, the lines and spaces, and counting frets |
 * | 1 | the clef's G line |
 *
 * Every line still needs a step of recall: it never ties a string to its
 * place on the staff (the open strings are cards in open position), and it
 * is the same for every card, so what it shows is never a tell (rule 4).
 */
export function FretToStaffContextPanel({
  guideLevel,
}: Pick<DrillContextPanelProps<D24Prompt, D24Answer>, 'guideLevel'> &
  Partial<DrillContextPanelProps<D24Prompt, D24Answer>>) {
  return (
    <div className={styles.panel}>
      <h2>From the fret to the staff</h2>
      <p>
        The clef curls round line 2, the <strong>G line</strong>. Each line or space up or down from
        it is the next note of the musical alphabet.
      </p>
      {guideLevel >= 2 && (
        <>
          <p>
            Lines, bottom up: <strong>E G B D F</strong>. Spaces: <strong>F A C E</strong>.
          </p>
          <p>Name the lit fret first: count frets up from its open string, a half step each.</p>
        </>
      )}
      {guideLevel >= 3 && (
        <p>
          Naturals are two frets apart, except <strong>B–C</strong> and <strong>E–F</strong>, one
          fret apart: one step up the staff either way.
        </p>
      )}
      {guideLevel >= 2 && (
        <p className={styles.note}>Guitar music sounds an octave lower than it is written.</p>
      )}
    </div>
  );
}
