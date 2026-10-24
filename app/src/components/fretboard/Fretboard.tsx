import { useMemo, type KeyboardEvent } from 'react';
import type { InlayShape } from '../../engine/garage/types';
import type { GuideLevel, Handedness } from '../../engine/model';
import {
  STANDARD_TUNING,
  allStrings,
  inRange,
  noteAt,
  stringCount,
  type AccidentalPref,
  type FretRange,
  type Position,
  type Tuning,
} from '../../theory';
import { useInlayStyle } from '../guitar/skin';
import {
  MARKER,
  MARKER_SHAPE,
  NUT_W,
  STRING_GAP,
  computeGeometry,
  minScale,
  type Cell,
  type NeckGeometry,
} from './geometry';
import { cellName, neckText, spokenNeckText } from './labels';
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
  /** The label as a screen reader should say it (`flat 3` for `♭3`), when the glyph may not be read. */
  spokenLabel?: string;
  /** Shape-outline group, e.g. a CAGED shape ID. */
  group?: string;
  /**
   * Ring and pulse the marker as a worked example's target, on top of its own
   * shape and colour (a 5th stays a triangle). `target` is for a cell with no degree.
   */
  emphasis?: boolean;
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
  /**
   * The inlay shape (design §3.8 neck skin). Defaults to the equipped
   * guitar's, from `NeckSkinProvider`, or dots. Only the shape changes: the
   * guide level and blind mode still decide whether inlays show.
   */
  inlayStyle?: InlayShape;
  /** Reveal note names in accessible cell labels (off during quizzes). */
  revealNotes?: boolean;
  accidentalPref?: AccidentalPref;
  onTapCell?: (pos: Position) => void;
  /**
   * Accessible names for tap targets, when "string N, fret M" would give the
   * answer away (D39 asks for a fret, so it names each fret by its marker).
   */
  cellLabel?: (pos: Position) => string;
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
 *
 * Markers that share a `group` are a shape: from guide level 2 a dashed
 * outline boxes the frets and strings it spans (design §3.5).
 */
export function Fretboard({
  tuning = STANDARD_TUNING,
  fretRange,
  activeRange,
  handedness = 'right',
  markers = [],
  guideLevel = 3,
  blindMode = false,
  inlayStyle,
  revealNotes = false,
  accidentalPref = 'sharp',
  onTapCell,
  cellLabel: labelCell,
  label = 'Fretboard',
  className,
}: FretboardProps) {
  const skinInlay = useInlayStyle();
  const inlayShape = inlayStyle ?? skinInlay;
  const strings = allStrings(tuning);
  const g = useMemo(
    () => computeGeometry({ fretRange, stringCount: stringCount(tuning), handedness }),
    [fretRange, tuning, handedness],
  );
  const showInlays = !(guideLevel === 0 && blindMode);
  const showNumbers = guideLevel >= 2;
  const showStringNames = guideLevel >= 2;
  const interactive = Boolean(onTapCell);

  const shownLabel = (m: FretMarker) => {
    if (m.forceLabel) return m.label;
    if (m.style === 'target') return undefined;
    if (guideLevel >= 3) return m.label;
    if (guideLevel >= 2 && m.style === 'root') return m.label;
    return undefined;
  };
  const labelFor = (m: FretMarker) => {
    const label = shownLabel(m);
    return label === undefined ? undefined : neckText(label);
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

  const names = g.names;
  const nutDimmed = Boolean(activeRange && names && !inRange(0, activeRange));
  // The names' wood halo would ring them with undimmed wood on a dimmed nut.
  const nameClass = nutDimmed
    ? `${styles.stringName} ${styles.stringNameDimmed}`
    : styles.stringName;
  // The wood and strings run on under the names' column, beyond the open strings.
  const edges = g.cells.flatMap((c) => [c.x, c.x + c.w]);
  if (names) edges.push(names.x, names.x + names.w);
  const neckLeft = Math.min(...edges);
  const neckRight = Math.max(...edges);
  const outlines = guideLevel >= 2 ? shapeOutlines(markers, g) : [];

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
      data-inlay-style={inlayShape}
      data-neck=""
    >
      <rect
        className={styles.wood}
        x={neckLeft}
        y={g.neckTop}
        width={neckRight - neckLeft}
        height={g.neckBottom - g.neckTop}
        rx={6}
      />

      {showInlays && <Inlays g={g} shape={inlayShape} handedness={handedness} />}

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
          .map((c) => {
            // A dimmed nut dims its string names' column with it.
            const x = c.fret === 0 && names ? Math.min(c.x, names.x) : c.x;
            const w = c.fret === 0 && names ? c.w + names.w : c.w;
            return (
              <rect
                key={`dim${c.fret}`}
                className={styles.dim}
                x={x}
                y={g.neckTop}
                width={w}
                height={g.neckBottom - g.neckTop}
                data-testid="dimmed-fret"
              />
            );
          })}

      {showNumbers &&
        g.cells
          .filter((c) => c.fret > 0)
          .map((c) => (
            <text key={`n${c.fret}`} className={styles.fretNumber} x={c.cx} y={g.height - 10}>
              {c.fret}
            </text>
          ))}

      {showStringNames &&
        names &&
        strings
          .filter((s) => !hiddenStringNames.has(s))
          .map((s) => {
            const name = neckText(openPc(s));
            const spoken = spokenNeckText(name);
            return (
              <text
                key={`sn${s}`}
                className={nameClass}
                x={names.cx}
                y={g.stringY(s)}
                dy="0.35em"
                role={spoken ? 'img' : undefined}
                aria-label={spoken}
                data-testid="string-name"
                data-string={s}
              >
                {name}
              </text>
            );
          })}

      {outlines.map((o) => (
        <rect
          key={`outline-${o.group}`}
          className={styles.outline}
          x={o.x}
          y={o.y}
          width={o.width}
          height={o.height}
          rx={12}
          data-testid="shape-outline"
          data-group={o.group}
        />
      ))}

      {markers.map((m) => {
        const cell = g.cell(m.fret);
        if (!cell) return null;
        const cy = g.stringY(m.string);
        const text = labelFor(m);
        const spoken = text && (m.spokenLabel ?? spokenNeckText(text));
        const kind = MARKER_SHAPE[m.style];
        const sq = MARKER.squareHalf;
        const dia = MARKER.diamondHalf;
        const shape =
          kind === 'square' ? (
            <rect x={cell.cx - sq} y={cy - sq} width={2 * sq} height={2 * sq} rx={7} />
          ) : kind === 'diamond' ? (
            <rect
              x={cell.cx - dia}
              y={cy - dia}
              width={2 * dia}
              height={2 * dia}
              rx={4}
              transform={`rotate(45 ${cell.cx} ${cy})`}
            />
          ) : kind === 'triangle' ? (
            <polygon points={trianglePoints(cell.cx, cy)} />
          ) : kind === 'hexagon' ? (
            <polygon points={hexagonPoints(cell.cx, cy)} />
          ) : (
            <circle cx={cell.cx} cy={cy} r={MARKER.circleR} />
          );
        return (
          <g
            key={`m${m.string}-${m.fret}-${m.style}`}
            className={`${styles.marker} ${styles[m.style]}${m.emphasis ? ` ${styles.emphasis}` : ''}`}
            data-testid={`marker-${m.style}`}
            data-emphasis={m.emphasis || undefined}
            data-string={m.string}
            data-fret={m.fret}
            role={spoken ? 'img' : undefined}
            aria-label={spoken || undefined}
          >
            {m.emphasis && (
              // The target's ring, drawn round the marker's own shape (M6-11).
              <g className={styles.ring} aria-hidden="true">
                {shape}
              </g>
            )}
            {shape}
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
          const name =
            labelCell?.(pos) ??
            cellName(pos, { tuning, pref: accidentalPref, revealNote: revealNotes });
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

/**
 * The inlays at the standard frets, drawn as `shape`. Dots are the classic
 * pair at 12; blocks and trapezoids are one plate per fret, as on the
 * Garage guitar, and paler, because notes and their labels sit on them.
 */
function Inlays({
  g,
  shape,
  handedness,
}: {
  g: NeckGeometry;
  shape: InlayShape;
  handedness: Handedness;
}) {
  const cy = (g.neckTop + g.neckBottom) / 2;
  return (
    <g data-testid="inlays">
      {g.inlays.map((inlay) => {
        const props = { 'data-inlay': shape, 'data-fret': inlay.fret };
        if (shape === 'dots') {
          return inlay.double ? (
            <g key={inlay.fret} {...props} className={styles.inlay}>
              <circle cx={inlay.cx} cy={g.neckTop + STRING_GAP * 1.5} r={7} />
              <circle cx={inlay.cx} cy={g.neckBottom - STRING_GAP * 1.5} r={7} />
            </g>
          ) : (
            <circle
              key={inlay.fret}
              {...props}
              className={styles.inlay}
              cx={inlay.cx}
              cy={cy}
              r={7}
            />
          );
        }
        const cell = g.cell(inlay.fret) as Cell;
        const half = cell.w * 0.28;
        const tall = (g.neckBottom - g.neckTop) / 2 - STRING_GAP * 0.35;
        // Trapezoids narrow towards the nut, which is on the left for a
        // right-handed player.
        const short = shape === 'trapezoids' ? tall * 0.62 : tall;
        const [left, right] = handedness === 'left' ? [tall, short] : [short, tall];
        const x0 = inlay.cx - half;
        const x1 = inlay.cx + half;
        const points = `${x0},${cy - left} ${x1},${cy - right} ${x1},${cy + right} ${x0},${cy + left}`;
        return (
          <polygon
            key={inlay.fret}
            {...props}
            className={`${styles.inlay} ${styles.inlayPlate}`}
            points={points}
          />
        );
      })}
    </g>
  );
}

interface Outline {
  group: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A box round each marker group's visible cells, inset so neighbouring cells stay clear. */
function shapeOutlines(markers: readonly FretMarker[], g: NeckGeometry): Outline[] {
  const groups = new Map<string, FretMarker[]>();
  for (const m of markers) {
    if (m.group && g.cell(m.fret)) groups.set(m.group, [...(groups.get(m.group) ?? []), m]);
  }
  const inset = 3;
  return [...groups].map(([group, ms]) => {
    const cells = ms.map((m) => g.cell(m.fret) as Cell);
    const ys = ms.map((m) => g.stringY(m.string));
    const x = Math.min(...cells.map((c) => c.x)) + inset;
    const y = Math.min(...ys) - STRING_GAP / 2 + inset;
    return {
      group,
      x,
      y,
      width: Math.max(...cells.map((c) => c.x + c.w)) - inset - x,
      height: Math.max(...ys) + STRING_GAP / 2 - inset - y,
    };
  });
}

/** An upward triangle around a marker centre, wide enough at mid-height for a label. */
function trianglePoints(cx: number, cy: number): string {
  const { up, down, half } = MARKER.triangle;
  return `${cx},${cy - up} ${cx + half},${cy + down} ${cx - half},${cy + down}`;
}

/** A flat-sided hexagon around a marker centre. */
function hexagonPoints(cx: number, cy: number): string {
  return [0, 60, 120, 180, 240, 300]
    .map((deg) => {
      const a = (deg * Math.PI) / 180;
      const r = MARKER.hexagonR;
      return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
    })
    .join(' ');
}
