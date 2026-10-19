import type { Handedness } from '../../engine/model';
import { d13Ladder, d13Pretty, type D13Prompt } from './logic';
import styles from './CapoNeck.module.css';

/** The neck from the nut to fret 7, the highest capo a prompt uses. */
const NECK_FRETS = 7;

interface Props {
  prompt: Pick<D13Prompt, 'ask' | 'shape' | 'capo' | 'sounding'>;
  /** Answered, or the worked example: the capo and every rung are named. */
  revealed: boolean;
  /** Guide level 2+: fret numbers under the cells. */
  fretNumbers: boolean;
  handedness: Handedness;
}

function spoken(note: string): string {
  return note.replace('#', ' sharp').replace(/(?<=^[A-G])b/, ' flat');
}

/**
 * The neck from the nut with the capo (design §8 style, drawn here because
 * the capo is D13's alone). Fret 0 holds the shapes' tonic as a square, the
 * capo fret the sounding tonic as a circle (shape as well as colour), and in
 * feedback the half steps between are named, one per fret. Before an answer
 * it shows only what the question gives, so it never answers it (M1-25).
 */
export function CapoNeck({ prompt, revealed, fretNumbers, handedness }: Props) {
  const rungs = d13Ladder(prompt);
  // A fret question asks for the capo, so it appears once answered.
  const showCapo = revealed || prompt.ask !== 'fret';
  const showShape = revealed || prompt.ask !== 'shape';
  const showSound = revealed || prompt.ask === 'shape';
  const frets = Array.from({ length: NECK_FRETS + 1 }, (_, f) => f);

  return (
    <ol
      className={styles.neck}
      data-handedness={handedness}
      data-testid="d13-neck"
      aria-label={
        showCapo ? `Neck with a capo on fret ${prompt.capo}` : 'Neck with no capo shown yet'
      }
    >
      {frets.map((fret) => {
        const rung = fret <= prompt.capo ? rungs[fret] : undefined;
        const capo = showCapo && fret === prompt.capo;
        let role: 'shape' | 'sound' | 'step' | null = null;
        if (fret === 0 && showShape) role = 'shape';
        else if (fret === prompt.capo && showSound) role = 'sound';
        else if (revealed && rung && fret > 0 && fret < prompt.capo) role = 'step';
        const note = role && rung ? rung.note : null;
        const words = [
          fret === 0 ? 'Open strings' : `Fret ${fret}`,
          capo ? 'capo' : null,
          role === 'shape' && note ? `${spoken(note)} shapes` : null,
          role === 'sound' && note ? `sounds ${spoken(note)}` : null,
          role === 'step' && note ? spoken(note) : null,
        ].filter(Boolean);
        return (
          <li
            key={fret}
            className={styles.cell}
            data-fret={fret}
            data-capo={capo || undefined}
            data-role={role ?? undefined}
            data-past-capo={showCapo && fret > prompt.capo ? true : undefined}
            aria-label={words.join(', ')}
          >
            {note && (
              <span className={styles.note} data-role={role ?? undefined} aria-hidden="true">
                {d13Pretty(note)}
              </span>
            )}
            {role === 'shape' && (
              <span className={styles.caption} aria-hidden="true">
                shapes
              </span>
            )}
            {role === 'sound' && (
              <span className={styles.caption} aria-hidden="true">
                sounds
              </span>
            )}
            {capo && <span className={styles.capo} aria-hidden="true" data-testid="d13-capo" />}
            {fretNumbers && fret > 0 && (
              <span className={styles.number} aria-hidden="true">
                {fret}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
