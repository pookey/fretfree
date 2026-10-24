import type { DrillContextPanelProps } from '../types';
import { d23PositionName, type D23Answer, type D23Prompt } from './logic';
import styles from './ContextPanel.module.css';

/**
 * D23's context panel (design §12): how a position is read. One finger per
 * fret from the position's fret, so every note on the staff has one place.
 * It names the hand's frets, which the prompt and the undimmed region show
 * anyway, never a note's cell; the session hides it at guide level 0
 * (design §3.5).
 */
export function PositionContextPanel({ prompt }: DrillContextPanelProps<D23Prompt, D23Answer>) {
  const { position } = prompt;
  const { from, to } = position.frets;
  return (
    <div className={styles.panel}>
      <h2>Reading in position</h2>
      {position.fret === 0 ? (
        <p>
          In <strong>open position</strong> the open strings and frets 1–3 play every note: one
          finger per fret, the index on fret 1.
        </p>
      ) : (
        <p>
          In <strong>{d23PositionName(position)}</strong> the index finger sits on fret {from} and
          each finger takes a fret, up to the little finger on fret {to}.
        </p>
      )}
      <p>
        Each note on the staff has <strong>one place</strong> in the position.
        {position.fret > 0 &&
          ' A note the four frets miss is a one-fret stretch, the index back or the little finger up.'}
      </p>
    </div>
  );
}
