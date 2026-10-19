import { useMemo, useState } from 'react';
import { useAppStore } from '../../../app-store';
import { Fretboard, type FretMarker } from '../../../components/fretboard/Fretboard';
import { TabStaff } from '../../../components/tab';
import { neckWindow, useSizeClass } from '../../../shell/size-class';
import { noteAt } from '../../../theory';
import { parseTab } from '../../../theory/tab';
import styles from '../../screens.module.css';

// An A minor pentatonic lick in 5th position.
const RIFF = parseTab(`
e|-------------5-8-|
B|---------5-8-----|
G|---5-7-----------|
D|-----------------|
A|-----------------|
E|-----------------|`);

/** Tab viewer (docs/design/tab-track.md): reference only, no grading. */
export function View() {
  const sizeClass = useSizeClass();
  const { handedness, accidentalPref } = useAppStore((s) => s.settings);
  const [picked, setPicked] = useState<number | null>(null);
  const range = neckWindow(sizeClass, 6);
  const markers = useMemo(
    () =>
      RIFF.map((e): FretMarker => ({
        ...e,
        style: e.string === picked ? 'root' : 'tone',
        label: noteAt(e, undefined, accidentalPref).pc,
      })),
    [picked, accidentalPref],
  );

  return (
    <>
      <p className={styles.muted}>
        Each tab line is a string, high E on top. The numbers are frets. Tap a line to find its
        string on the neck.
      </p>
      <div className={styles.neckScroll}>
        <TabStaff
          notes={RIFF}
          guideLevel={3}
          lineMarks={picked ? [{ string: picked, style: 'selected' }] : []}
          onPickLine={(s) => setPicked((p) => (p === s ? null : s))}
          label="Tab of an A minor pentatonic lick"
        />
      </div>
      <div className={styles.neckScroll}>
        <Fretboard
          fretRange={range}
          handedness={handedness}
          markers={markers}
          guideLevel={3}
          accidentalPref={accidentalPref}
          label="The lick on the neck"
        />
      </div>
    </>
  );
}
