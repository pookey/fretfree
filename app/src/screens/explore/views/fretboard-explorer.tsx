import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useAppStore } from '../../../app-store';
import { Fretboard, type FretMarker } from '../../../components/fretboard/Fretboard';
import { SKILLS } from '../../../engine';
import { focusHref, noteSkillIds } from '../../../session/focus';
import { neckWindow, useSizeClass } from '../../../shell/size-class';
import { allStrings, isNatural, noteAt } from '../../../theory';
import styles from '../../screens.module.css';

export const id = 'fretboard-explorer';
export const title = 'Fretboard explorer';
export const order = 10;

/** "Quiz me on this": a session on the notes the explorer shows. */
const QUIZ_HREF = focusHref({ skillIds: noteSkillIds(SKILLS) });

/** Fretboard explorer (design §7 Explore): reference only, no grading. */
export function View() {
  const sizeClass = useSizeClass();
  const { handedness, accidentalPref } = useAppStore((s) => s.settings);
  const [showAll, setShowAll] = useState(false);
  const range = neckWindow(sizeClass, 0);
  const markers = useMemo(() => {
    const out: FretMarker[] = [];
    for (const string of allStrings()) {
      for (let fret = range.from; fret <= range.to; fret++) {
        const n = noteAt({ string, fret }, undefined, accidentalPref);
        if (!showAll && !isNatural(n.pc)) continue;
        out.push({ string, fret, style: n.pc === 'C' ? 'root' : 'tone', label: n.pc });
      }
    }
    return out;
  }, [showAll, range.from, range.to, accidentalPref]);

  return (
    <>
      <div className={styles.toolbar}>
        <label className={styles.toggle}>
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
          Show sharps and flats
        </label>
        <Link to={QUIZ_HREF} className={styles.secondaryButton}>
          Quiz me on this
        </Link>
      </div>
      <div className={styles.neckScroll}>
        <Fretboard
          fretRange={range}
          handedness={handedness}
          markers={markers}
          guideLevel={3}
          accidentalPref={accidentalPref}
          label="Fretboard explorer"
        />
      </div>
    </>
  );
}
