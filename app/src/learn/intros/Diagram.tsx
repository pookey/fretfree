import { Fretboard } from '../../components/fretboard/Fretboard';
import { NoteWheel } from '../../drills/d3-note-wheel/NoteWheel';
import type { Handedness } from '../../engine/model';
import type { AccidentalPref } from '../../theory';
import type { IntroDiagram as Diagram } from './types';
import styles from './Diagram.module.css';

/** An intro's one small diagram: a fixed neck window, or the note wheel. */
export function IntroDiagram({
  diagram,
  handedness,
  pref,
}: {
  diagram: Diagram;
  handedness: Handedness;
  pref: AccidentalPref;
}) {
  if (diagram.kind === 'wheel') {
    return (
      <div className={styles.wheel} data-testid="intro-diagram" data-kind="wheel">
        <NoteWheel guideLevel={diagram.guideLevel} pref={pref} start={diagram.start} />
      </div>
    );
  }
  return (
    <div data-testid="intro-diagram" data-kind="neck">
      <Fretboard
        fretRange={diagram.range}
        markers={diagram.markers}
        guideLevel={3}
        handedness={handedness}
        accidentalPref={pref}
        label={diagram.label}
        className={styles.fretboard}
      />
    </div>
  );
}
