import { useState } from 'react';
import {
  Staff,
  naturalAt,
  positionName,
  type StaffNote,
  type StaffPosition,
} from '../../../components/staff';
import type { GuideLevel } from '../../../engine/model';
import styles from '../../screens.module.css';

// Two bars in G from open low E: dotted rhythms, a rest, a tie, a triplet,
// a natural and a note above the staff.
const PHRASE: StaffNote[] = [
  { pitches: ['E2'], value: 'q', tab: [{ string: 6, fret: 0 }] },
  { pitches: ['F#2'], value: '8', dots: 1, tab: [{ string: 6, fret: 2 }] },
  { pitches: ['G2'], value: '16', tab: [{ string: 6, fret: 3 }] },
  { value: 'q' },
  { pitches: ['A2'], value: 'q', tie: true, barAfter: true, tab: [{ string: 5, fret: 0 }] },
  { pitches: ['A2'], value: '8', tab: [{ string: 5, fret: 0 }] },
  { pitches: ['B2'], value: '8', tab: [{ string: 5, fret: 2 }] },
  { pitches: ['C3'], value: '8', tab: [{ string: 5, fret: 3 }] },
  { pitches: ['D3'], value: '8', tab: [{ string: 4, fret: 0 }] },
  { pitches: ['E3'], value: '8', tab: [{ string: 4, fret: 2 }] },
  { pitches: ['F3'], value: 'q', tab: [{ string: 4, fret: 3 }] },
  { pitches: ['C5'], value: 'q', tab: [{ string: 1, fret: 8 }] },
];
const TRIPLET = [{ from: 7, count: 3 }];

const TAB_LEVELS: { label: string; level: GuideLevel }[] = [
  { label: 'Full', level: 3 },
  { label: 'Faint', level: 1 },
  { label: 'Off', level: 0 },
];

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Notation viewer (design §12): reference only, no grading. */
export function View() {
  const [level, setLevel] = useState<GuideLevel>(3);
  const [picked, setPicked] = useState<StaffPosition | null>(null);

  return (
    <>
      <p className={styles.muted}>
        Guitar music is written on the treble clef with an 8 below it: it sounds an octave lower
        than it looks. Open low E hangs under three ledger lines.
      </p>
      <div className={styles.settings}>
        <label>
          Tab under the staff
          <select value={level} onChange={(e) => setLevel(Number(e.target.value) as GuideLevel)}>
            {TAB_LEVELS.map((t) => (
              <option key={t.level} value={t.level}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className={styles.neckScroll}>
        <Staff
          notes={PHRASE}
          keySignature="G"
          timeSignature="4/4"
          tuplets={TRIPLET}
          showTab
          guideLevel={level}
          label="Two bars in G major"
        />
      </div>

      <h2 className={styles.sectionTitle}>Lines and spaces</h2>
      <p className={styles.muted} aria-live="polite" data-testid="staff-readout">
        {picked === null
          ? 'Tap a line or space, or slide to find one.'
          : `${capitalise(positionName(picked))}: ${naturalAt(picked)}`}
      </p>
      <div className={styles.neckScroll}>
        <Staff
          positionRange={[-7, 11]}
          marks={picked === null ? [] : [{ position: picked, style: 'selected' }]}
          onTapPosition={(p) => setPicked(p)}
          label="Find a line or space"
        />
      </div>
    </>
  );
}
