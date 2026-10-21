import type { GuideLevel } from '../../engine/model';
import { chromaOf, chromaToPc, isNatural, type AccidentalPref } from '../../theory';
import { displayPc } from '../../theory/pitch-display';
import { HALF_STEP_PAIRS } from './logic';
import styles from './NoteWheel.module.css';

export interface NoteWheelProps {
  guideLevel: GuideLevel;
  pref: AccidentalPref;
  /** The prompt's starting note: drawn with an outer ring. */
  start?: string;
  /** Shown only once answered, so the wheel never gives the answer away. */
  expected?: string;
  given?: string;
}

const C = 100;
const R = 74;

function point(chroma: number, radius: number): { x: number; y: number } {
  const a = ((chroma * 30 - 90) * Math.PI) / 180;
  return { x: C + radius * Math.cos(a), y: C + radius * Math.sin(a) };
}

function safeChroma(note: string | undefined): number | null {
  if (!note) return null;
  try {
    return chromaOf(note);
  } catch {
    return null;
  }
}

/**
 * The 12-note wheel, C at the top and rising clockwise (design §6 D3). B–C and
 * E–F are joined by a heavy arc and a "½" badge; every other natural pair has
 * a sharp/flat between them. It fades with the guide level (design §3.5):
 * 3 names all 12 notes; 1–2 keep the 12 positions and the ½ marks but name
 * only the starting note, so a musical-alphabet question can't be read off
 * the wheel (M10-05). The answer, and a wrong choice, are named once answered.
 */
export function NoteWheel({ guideLevel, pref, start, expected, given }: NoteWheelProps) {
  const roles = new Map<number, string>();
  const startChroma = safeChroma(start);
  const expectedChroma = safeChroma(expected);
  const givenChroma = safeChroma(given);
  if (startChroma !== null) roles.set(startChroma, 'start');
  if (givenChroma !== null) roles.set(givenChroma, 'given');
  if (expectedChroma !== null) roles.set(expectedChroma, 'expected');
  const named = guideLevel >= 3;

  return (
    <svg
      className={styles.wheel}
      viewBox="0 0 200 200"
      role="img"
      aria-label={
        named
          ? 'Note wheel: B–C and E–F are half steps; every other pair of neighbours in the musical alphabet is a whole step'
          : `Note wheel: the 12 notes${start ? ` from ${displayPc(start)}` : ''}, with ½ marks where two neighbours in the musical alphabet are only a half step apart`
      }
      data-testid="note-wheel"
      data-guide-level={guideLevel}
    >
      <circle className={styles.ring} cx={C} cy={C} r={R} />
      {HALF_STEP_PAIRS.map(([lo, hi]) => {
        const a = point(chromaOf(lo), R);
        const b = point(chromaOf(hi), R);
        const mid = (chromaOf(lo) + 0.5) % 12;
        const badge = point(mid, R + 20);
        return (
          <g key={lo} data-testid={`half-step-${lo}-${hi}`}>
            <path
              className={styles.halfStep}
              d={`M ${a.x} ${a.y} A ${R} ${R} 0 0 1 ${b.x} ${b.y}`}
            />
            <text className={styles.badge} x={badge.x} y={badge.y}>
              ½
            </text>
          </g>
        );
      })}
      {Array.from({ length: 12 }, (_, chroma) => {
        const pc = chromaToPc(chroma, pref);
        const natural = isNatural(pc);
        const role = roles.get(chroma);
        const labelled = named || role !== undefined;
        const { x, y } = point(chroma, R);
        // Unnamed, a natural is a larger dot than a sharp: the gaps still show.
        const r = labelled ? (natural ? 15 : 12) : natural ? 7 : 4;
        return (
          <g
            key={chroma}
            className={styles.note}
            data-testid={`wheel-note-${pc}`}
            data-role={role}
            data-natural={natural || undefined}
          >
            {role === 'start' && <circle className={styles.startRing} cx={x} cy={y} r={20} />}
            <circle cx={x} cy={y} r={r} />
            {labelled && (
              <text x={x} y={y}>
                {displayPc(pc)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
