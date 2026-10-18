import { useMemo, type KeyboardEvent } from 'react';
import type { GuideLevel, Handedness } from '../../engine/model';
import {
  STANDARD_TUNING,
  allStrings,
  cellLabel,
  inRange,
  noteAt,
  stringCount,
  type AccidentalPref,
  type FretRange,
  type Position,
  type Tuning,
} from '../../theory';
import { NUT_W, STRING_GAP, computeGeometry, minScale } from './geometry';
import styles from './Fretboard.module.css';

export type MarkerStyle =
  | 'target'
  | 'root'
  | 'tone'
  | 'correct'
  | 'wrong'
  | 'ghost'
  // Chord tones by degree: the 3rd a circle, the 5th a triangle, the 7th a hexagon.
  | 'third'
  | 'fifth'
  | 'seventh';

export interface FretMarker extends Position {
  style: MarkerStyle;
  label?: string;
  /**
   * Show the label regardless of guide level (worked examples, feedback).
   * A `target` is the queried cell, so only this can label it.
   */
  forceLabel?: boolean;
  /** Shape-outline group, e.g. a CAGED shape ID. */
  group?: string;
}

export interface FretboardProps {
  tuning?: Tuning;
  fretRange: FretRange;
  /** Frets outside this range are dimmed, not hidden (design §7 adaptive scope). */
  activeRange?: FretRange;
  handedness?: Handedness;
  markers?: readonly FretMarker[];
  guideLevel?: GuideLevel;
  /** Level 0 with blind mode also hides the inlays. */
  blindMode?: boolean;
  /** Reveal note names in accessible cell labels (off during quizzes). */
  revealNotes?: boolean;
  accidentalPref?: AccidentalPref;
  onTapCell?: (pos: Position) => void;
  /** Accessible name for the whole neck. */
  label?: string;
  className?: string;
}

/**
 * The touch-first SVG neck (design §8). Pure presentation: theory comes from
 * `theory/`. Player view: horizontal, low string at the bottom.
 *
 * Guide levels (design §3.5): 3 = all marker labels + string names + fret
 * numbers; 2 = root labels + string names + fret numbers; 1 = inlays only;
 * 0 = bare neck (inlays hidden too in blind mode).
 *
 * A `target` marker is a recall prompt: guide levels never label it, and no
 * string name gives its note away (retrieval practice, research/02).
 */
export function Fretboard({
  tuning = STANDARD_TUNING,
  fretRange,
  activeRange,
  handedness = 'right',
  markers = [],
  guideLevel = 3,
  blindMode = false,
  revealNotes = false,
  accidentalPref = 'sharp',
  onTapCell,
  label = 'Fretboard',
  className,
}: FretboardProps) {
  const strings = allStrings(tuning);
  const g = useMemo(
    () => computeGeometry({ fretRange, stringCount: stringCount(tuning), handedness }),
    [fretRange, tuning, handedness],
  );
  const showInlays = !(guideLevel === 0 && blindMode);
  const showNumbers = guideLevel >= 2;
  const showStringNames = guideLevel >= 2;
  const interactive = Boolean(onTapCell);

  const labelFor = (m: FretMarker) => {
    if (m.forceLabel) return m.label;
    if (m.style === 'target') return undefined;
    if (guideLevel >= 3) return m.label;
    if (guideLevel >= 2 && m.style === 'root') return m.label;
    return undefined;
  };

  const onKey = (e: KeyboardEvent, pos: Position) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onTapCell?.(pos);
    }
  };

  // An unlabelled target on its open string's pitch class (fret 0, 12, 24)
  // would be named by the string label at the nut.
  const openPc = (s: number) => noteAt({ string: s, fret: 0 }, tuning, accidentalPref).pc;
  const hiddenStringNames = new Set(
    markers
      .filter(
        (m) =>
          m.style === 'target' &&
          !m.forceLabel &&
          noteAt(m, tuning, accidentalPref).pc === openPc(m.string),
      )
      .map((m) => m.string),
  );

  const openCell = g.cell(0);
  const neckLeft = Math.min(...g.cells.map((c) => c.x));
  const neckRight = Math.max(...g.cells.map((c) => c.x + c.w));

  return (
    <svg
      className={[styles.neck, className].filter(Boolean).join(' ')}
      viewBox={`0 0 ${g.width} ${g.height}`}
      style={{ minWidth: `${Math.ceil(g.width * minScale(g))}px` }}
      role="group"
      aria-label={label}
      data-fret-from={fretRange.from}
      data-fret-to={fretRange.to}
      data-handedness={handedness}
      data-guide-level={guideLevel}
    >
      <rect
        className={styles.wood}
        x={neckLeft}
        y={g.neckTop}
        width={neckRight - neckLeft}
        height={g.neckBottom - g.neckTop}
        rx={6}
      />

      {showInlays &&
        g.inlays.map((inlay) =>
          inlay.double ? (
            <g key={inlay.fret} className={styles.inlay}>
              <circle cx={inlay.cx} cy={g.neckTop + STRING_GAP * 1.5} r={7} />
              <circle cx={inlay.cx} cy={g.neckBottom - STRING_GAP * 1.5} r={7} />
            </g>
          ) : (
            <circle
              key={inlay.fret}
              className={styles.inlay}
              cx={inlay.cx}
              cy={(g.neckTop + g.neckBottom) / 2}
              r={7}
            />
          ),
        )}

      {g.wires.map((w) =>
        w.nut ? (
          <rect
            key={`w${w.fret}`}
            className={styles.nut}
            x={w.x - NUT_W / 2}
            y={g.neckTop}
            width={NUT_W}
            height={g.neckBottom - g.neckTop}
          />
        ) : (
          <line
            key={`w${w.fret}`}
            className={styles.wire}
            x1={w.x}
            x2={w.x}
            y1={g.neckTop}
            y2={g.neckBottom}
          />
        ),
      )}

      {strings.map((s) => (
        <line
          key={`s${s}`}
          className={styles.string}
          x1={neckLeft}
          x2={neckRight}
          y1={g.stringY(s)}
          y2={g.stringY(s)}
          style={{ strokeWidth: 1 + (s - 1) * 0.45 }}
        />
      ))}

      {activeRange &&
        g.cells
          .filter((c) => !inRange(c.fret, activeRange))
          .map((c) => (
            <rect
              key={`dim${c.fret}`}
              className={styles.dim}
              x={c.x}
              y={g.neckTop}
              width={c.w}
              height={g.neckBottom - g.neckTop}
              data-testid="dimmed-fret"
            />
          ))}

      {showNumbers &&
        g.cells
          .filter((c) => c.fret > 0)
          .map((c) => (
            <text key={`n${c.fret}`} className={styles.fretNumber} x={c.cx} y={g.height - 10}>
              {c.fret}
            </text>
          ))}

      {showStringNames &&
        openCell &&
        strings
          .filter((s) => !hiddenStringNames.has(s))
          .map((s) => (
            <text
              key={`sn${s}`}
              className={styles.stringName}
              x={openCell.cx}
              y={g.stringY(s)}
              dy="0.35em"
              data-testid="string-name"
              data-string={s}
            >
              {openPc(s)}
            </text>
          ))}

      {markers.map((m) => {
        const cell = g.cell(m.fret);
        if (!cell) return null;
        const cy = g.stringY(m.string);
        const text = labelFor(m);
        return (
          <g
            key={`m${m.string}-${m.fret}-${m.style}`}
            className={`${styles.marker} ${styles[m.style]}`}
            data-testid={`marker-${m.style}`}
            data-string={m.string}
            data-fret={m.fret}
          >
            {m.style === 'root' ? (
              <rect x={cell.cx - 17} y={cy - 17} width={34} height={34} rx={7} />
            ) : m.style === 'wrong' ? (
              <rect
                x={cell.cx - 16}
                y={cy - 16}
                width={32}
                height={32}
                rx={4}
                transform={`rotate(45 ${cell.cx} ${cy})`}
              />
            ) : m.style === 'fifth' ? (
              <polygon points={trianglePoints(cell.cx, cy)} />
            ) : m.style === 'seventh' ? (
              <polygon points={hexagonPoints(cell.cx, cy)} />
            ) : (
              <circle cx={cell.cx} cy={cy} r={18} />
            )}
            {text && (
              // A triangle's centroid sits below its box centre, and it narrows
              // towards the top, so long labels (F##) shrink to fit.
              <text
                x={cell.cx}
                y={m.style === 'fifth' ? cy + 3 : cy}
                dy="0.35em"
                className={m.style === 'fifth' && text.length > 2 ? styles.longLabel : undefined}
              >
                {text}
              </text>
            )}
          </g>
        );
      })}

      {strings.map((s) =>
        g.cells.map((c) => {
          const pos = { string: s, fret: c.fret };
          const name = cellLabel(pos, { tuning, pref: accidentalPref, revealNote: revealNotes });
          return (
            <rect
              key={`hit${s}-${c.fret}`}
              className={styles.hit}
              x={c.x}
              y={g.stringY(s) - STRING_GAP / 2}
              width={c.w}
              height={STRING_GAP}
              role={interactive ? 'button' : undefined}
              aria-label={interactive ? name : undefined}
              tabIndex={interactive ? 0 : undefined}
              data-cell={`s${s}f${c.fret}`}
              onPointerDown={interactive ? () => onTapCell?.(pos) : undefined}
              onKeyDown={interactive ? (e) => onKey(e, pos) : undefined}
            />
          );
        }),
      )}
    </svg>
  );
}

/** An upward triangle around a marker centre, wide enough at mid-height for a label. */
function trianglePoints(cx: number, cy: number): string {
  return `${cx},${cy - 24} ${cx + 26},${cy + 17} ${cx - 26},${cy + 17}`;
}

/** A flat-sided hexagon around a marker centre. */
function hexagonPoints(cx: number, cy: number): string {
  return [0, 60, 120, 180, 240, 300]
    .map((deg) => {
      const a = (deg * Math.PI) / 180;
      return `${(cx + 20 * Math.cos(a)).toFixed(1)},${(cy + 20 * Math.sin(a)).toFixed(1)}`;
    })
    .join(' ');
}
