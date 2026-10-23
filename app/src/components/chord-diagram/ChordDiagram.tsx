import { useMemo } from 'react';
import type { GuideLevel, Handedness } from '../../engine/model';
import { STANDARD_TUNING, allStrings, noteAt, stringCount, type Tuning } from '../../theory';
import {
  DOT_R,
  GUTTER_W,
  NUT_H,
  STRING_GAP,
  computeChartGeometry,
  hexagonPoints,
  trianglePoints,
} from './geometry';
import {
  MIN_ROWS,
  barresOf,
  describeVoicing,
  fretWindow,
  mutedStrings,
  type ChordDiagramNote,
  type ChordDotStyle,
  type ChordVoicing,
} from './model';
import styles from './ChordDiagram.module.css';

/** The size of a degree marker above the nut, smaller than a fretted dot to fit the head. */
const OPEN_R = 11;

/** What a dot says: its finger number, its `label` (degree or note), or nothing. */
export type DotText = 'finger' | 'label' | 'none';

export interface ChordDiagramProps {
  voicing: ChordVoicing;
  tuning?: Tuning;
  handedness?: Handedness;
  /** Chord name shown above the diagram. Leave it out when the name is the answer (D36). */
  name?: string;
  dotText?: DotText;
  /** Off draws roots as plain tones without labels, e.g. when the root is the answer. */
  highlightRoots?: boolean;
  /**
   * Fades `label` text and the string names like the neck (design §3.5):
   * 3 = all labels, 2 = root labels, 1–0 = none. Fingers are how to play the
   * shape, not a recall answer, so they stay.
   */
  guideLevel?: GuideLevel;
  minRows?: number;
  /** Accessible name; defaults to the chord name plus a string-by-string description. */
  label?: string;
  className?: string;
}

/**
 * A vertical chord diagram (design §8 chart view) drawn with the neck's wood,
 * wires, strings and marker shapes. Pure presentation: build the voicing with
 * `parseVoicing` or `voicingFromShape`.
 */
export function ChordDiagram({
  voicing,
  tuning = STANDARD_TUNING,
  handedness = 'right',
  name,
  dotText = 'finger',
  highlightRoots = true,
  guideLevel = 3,
  minRows = MIN_ROWS,
  label,
  className,
}: ChordDiagramProps) {
  const strings = allStrings(tuning);
  const span = fretWindow(voicing, minRows);
  const g = useMemo(
    () =>
      computeChartGeometry({
        stringCount: stringCount(tuning),
        baseFret: span.baseFret,
        rows: span.rows,
        handedness,
      }),
    [tuning, span.baseFret, span.rows, handedness],
  );
  const barres = barresOf(voicing);
  const muted = mutedStrings(voicing, tuning);
  const open = voicing.notes.filter((n) => n.fret === 0);
  const fretted = voicing.notes.filter((n) => n.fret > 0);
  const styleOf = (n: ChordDiagramNote): ChordDotStyle => {
    const style = n.style ?? 'tone';
    return style === 'root' && !highlightRoots ? 'tone' : style;
  };
  const textOf = (n: ChordDiagramNote): string | undefined => {
    if (dotText === 'finger') return n.finger === undefined ? undefined : String(n.finger);
    if (dotText === 'none') return undefined;
    // A hidden root must not be named by its label either ("R", or the note).
    if (!highlightRoots && n.style === 'root') return undefined;
    if (guideLevel >= 3) return n.label;
    if (guideLevel >= 2 && styleOf(n) === 'root') return n.label;
    return undefined;
  };
  const description = describeVoicing(voicing, {
    tuning,
    fingers: dotText === 'finger',
    roots: highlightRoots,
    labelOf: dotText === 'label' ? textOf : undefined,
  });
  const accessibleName = label ?? `${name ?? 'Chord'} diagram: ${description}`;
  const showStringNames = guideLevel >= 2;
  const woodPad = STRING_GAP / 2;
  const firstWire = span.baseFret === 1 ? 1 : 0;

  return (
    <figure className={[styles.figure, className].filter(Boolean).join(' ')}>
      {name && (
        <figcaption className={styles.name} aria-hidden="true">
          {name}
        </figcaption>
      )}
      <svg
        className={styles.chart}
        viewBox={`0 0 ${g.width} ${g.height}`}
        role="img"
        aria-label={accessibleName}
        data-base-fret={span.baseFret}
        data-rows={span.rows}
        data-handedness={handedness}
      >
        <rect
          className={styles.wood}
          x={g.neckLeft - woodPad}
          y={g.neckTop}
          width={g.neckRight - g.neckLeft + 2 * woodPad}
          height={g.neckBottom - g.neckTop}
          rx={6}
        />

        {span.baseFret === 1 ? (
          <rect
            className={styles.nut}
            x={g.neckLeft - woodPad}
            y={g.neckTop - NUT_H}
            width={g.neckRight - g.neckLeft + 2 * woodPad}
            height={NUT_H}
            rx={2}
            data-testid="chord-nut"
          />
        ) : (
          <text
            className={styles.position}
            x={handedness === 'left' ? g.width - GUTTER_W / 2 : GUTTER_W / 2}
            y={g.fretY(span.baseFret)}
            dy="0.35em"
            data-testid="chord-position"
          >
            {`${span.baseFret}fr`}
          </text>
        )}

        {Array.from({ length: span.rows + 1 - firstWire }, (_, i) => i + firstWire).map((i) => (
          <line
            key={`w${i}`}
            className={styles.wire}
            x1={g.neckLeft - woodPad}
            x2={g.neckRight + woodPad}
            y1={g.wireY(i)}
            y2={g.wireY(i)}
          />
        ))}

        {strings.map((s) => (
          <line
            key={`s${s}`}
            className={styles.string}
            x1={g.stringX(s)}
            x2={g.stringX(s)}
            y1={g.neckTop}
            y2={g.neckBottom}
            style={{ strokeWidth: 1 + (s - 1) * 0.45 }}
          />
        ))}

        {/* On the wood: the board's marker colours apply here (`data-neck`,
            styles/boards.css), but not above the nut, where the page is behind. */}
        <g data-neck="">
          {barres.map((b) => {
            const x1 = Math.min(g.stringX(b.from), g.stringX(b.to));
            const x2 = Math.max(g.stringX(b.from), g.stringX(b.to));
            const h = DOT_R * 1.5;
            return (
              <rect
                key={`b${b.fret}-${b.from}`}
                className={styles.barre}
                x={x1 - h / 2}
                y={g.fretY(b.fret) - h / 2}
                width={x2 - x1 + h}
                height={h}
                rx={h / 2}
                data-testid="chord-barre"
                data-fret={b.fret}
                data-from={b.from}
                data-to={b.to}
              />
            );
          })}

          {fretted.map((n) => {
            const cx = g.stringX(n.string);
            const cy = g.fretY(n.fret);
            const style = styleOf(n);
            const text = textOf(n);
            return (
              <g
                key={`d${n.string}`}
                className={`${styles.dot} ${styles[style]}`}
                data-testid="chord-dot"
                data-string={n.string}
                data-fret={n.fret}
                data-style={style}
              >
                {style === 'root' ? (
                  <rect
                    x={cx - DOT_R}
                    y={cy - DOT_R}
                    width={2 * DOT_R}
                    height={2 * DOT_R}
                    rx={DOT_R * 0.4}
                  />
                ) : style === 'fifth' ? (
                  <polygon points={trianglePoints(cx, cy)} />
                ) : style === 'seventh' ? (
                  <polygon points={hexagonPoints(cx, cy)} />
                ) : (
                  <circle cx={cx} cy={cy} r={DOT_R} />
                )}
                {text && (
                  <text
                    x={cx}
                    y={style === 'fifth' ? cy + 3 : cy}
                    dy="0.35em"
                    className={text.length > 2 ? styles.longLabel : undefined}
                  >
                    {text}
                  </text>
                )}
              </g>
            );
          })}
        </g>

        {open.map((n) => {
          const cx = g.stringX(n.string);
          const cy = g.headY;
          const style = styleOf(n);
          const text = textOf(n);
          // A 3rd, 5th or 7th takes its degree's filled marker, as a fretted dot does.
          const degree = style === 'third' || style === 'fifth' || style === 'seventh';
          const className = degree
            ? `${styles.openDegree} ${styles[style]}`
            : style === 'root'
              ? styles.openRoot
              : styles.open;
          return (
            <g
              key={`o${n.string}`}
              className={className}
              data-testid="chord-open"
              data-string={n.string}
              data-style={degree || style === 'root' ? style : 'tone'}
            >
              {style === 'root' ? (
                <rect x={cx - 9} y={cy - 9} width={18} height={18} rx={4} />
              ) : style === 'fifth' ? (
                <polygon points={trianglePoints(cx, cy, OPEN_R)} />
              ) : style === 'seventh' ? (
                <polygon points={hexagonPoints(cx, cy, OPEN_R)} />
              ) : (
                <circle cx={cx} cy={cy} r={degree ? OPEN_R : 9} />
              )}
              {text && (
                <text x={cx} y={style === 'fifth' ? cy + 2 : cy} dy="0.35em">
                  {text}
                </text>
              )}
            </g>
          );
        })}

        {muted.map((s) => {
          const cx = g.stringX(s);
          const d = 8;
          return (
            <g key={`x${s}`} className={styles.muted} data-testid="chord-muted" data-string={s}>
              <line x1={cx - d} y1={g.headY - d} x2={cx + d} y2={g.headY + d} />
              <line x1={cx - d} y1={g.headY + d} x2={cx + d} y2={g.headY - d} />
            </g>
          );
        })}

        {showStringNames &&
          strings.map((s) => (
            <text
              key={`sn${s}`}
              className={styles.stringName}
              x={g.stringX(s)}
              y={g.footY}
              dy="0.35em"
              data-testid="chord-string-name"
              data-string={s}
            >
              {noteAt({ string: s, fret: 0 }, tuning).pc}
            </text>
          ))}
      </svg>
    </figure>
  );
}
