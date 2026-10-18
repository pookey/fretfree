import { useId, useMemo, type KeyboardEvent } from 'react';
import type { Handedness } from '../../engine/model';
import {
  STANDARD_TUNING,
  allStrings,
  stringCount,
  type AccidentalPref,
  type FretRange,
  type Position,
  type Tuning,
} from '../../theory';
import { NUT_W, STRING_GAP, computeGeometry, minScale } from '../fretboard/geometry';
import { cellSummary, type HeatCell } from './aggregate';
import { heatColour } from './palette';
import styles from './Heatmap.module.css';

/** Room beside the neck for the string numbers. */
const LABEL_W = 30;
const INSET_X = 4;
const INSET_Y = 6;

export interface FretboardHeatmapProps {
  cells: readonly HeatCell[];
  fretRange: FretRange;
  tuning?: Tuning;
  accidentalPref?: AccidentalPref;
  handedness?: Handedness;
  selected?: Position | null;
  onSelect?: (pos: Position) => void;
  label?: string;
}

/**
 * The mastery map (design §7 Progress): the neck from <Fretboard>'s geometry,
 * with one tile per cell. Colour = stability band, a hatched dashed tile = slow
 * (median answer over target), no tile = not practised yet. Every cell is a
 * button so its stats are a tap (or Enter) away.
 */
export function FretboardHeatmap({
  cells,
  fretRange,
  tuning = STANDARD_TUNING,
  accidentalPref = 'sharp',
  handedness = 'right',
  selected = null,
  onSelect,
  label = 'Fretboard mastery map',
}: FretboardHeatmapProps) {
  const g = useMemo(
    () => computeGeometry({ fretRange, stringCount: stringCount(tuning), handedness }),
    [fretRange, tuning, handedness],
  );
  const byKey = useMemo(() => new Map(cells.map((c) => [`${c.string}:${c.fret}`, c])), [cells]);
  const neckLeft = Math.min(...g.cells.map((c) => c.x));
  const neckRight = Math.max(...g.cells.map((c) => c.x + c.w));
  const left = handedness === 'left';
  const viewX = left ? 0 : -LABEL_W;
  const labelX = left ? g.width + LABEL_W / 2 : -LABEL_W / 2;
  const width = g.width + LABEL_W;
  const selectedCell = selected ? g.cell(selected.fret) : undefined;
  const hatchId = `heat-hatch-${useId().replace(/[^\w-]/g, '')}`;

  const onKey = (e: KeyboardEvent, pos: Position) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect?.(pos);
    }
  };

  return (
    <svg
      className={styles.neck}
      viewBox={`${viewX} 0 ${width} ${g.height}`}
      style={{ minWidth: `${Math.ceil(width * minScale(g))}px` }}
      role="group"
      aria-label={label}
      data-fret-from={fretRange.from}
      data-fret-to={fretRange.to}
      data-handedness={handedness}
    >
      <defs>
        {/* Dims slow tiles without shifting their hue, so the band still reads. */}
        <pattern
          id={hatchId}
          width={8}
          height={8}
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <rect className={styles.hatch} width={4} height={8} />
        </pattern>
      </defs>
      <rect
        className={styles.wood}
        x={neckLeft}
        y={g.neckTop}
        width={neckRight - neckLeft}
        height={g.neckBottom - g.neckTop}
        rx={6}
      />
      {g.inlays.map((inlay) => (
        <circle
          key={inlay.fret}
          className={styles.inlay}
          cx={inlay.cx}
          cy={(g.neckTop + g.neckBottom) / 2}
          r={7}
        />
      ))}
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
      {allStrings(tuning).map((s) => (
        <g key={`s${s}`}>
          <line
            className={styles.string}
            x1={neckLeft}
            x2={neckRight}
            y1={g.stringY(s)}
            y2={g.stringY(s)}
            style={{ strokeWidth: 1 + (s - 1) * 0.45 }}
          />
          <text className={styles.stringNumber} x={labelX} y={g.stringY(s)} dy="0.35em">
            {s}
          </text>
        </g>
      ))}
      {g.cells
        .filter((c) => c.fret > 0)
        .map((c) => (
          <text key={`n${c.fret}`} className={styles.fretNumber} x={c.cx} y={g.height - 10}>
            {c.fret}
          </text>
        ))}

      {allStrings(tuning).map((s) =>
        g.cells.map((c) => {
          const cell = byKey.get(`${s}:${c.fret}`);
          if (!cell || cell.band === null) return null;
          const tile = {
            x: c.x + INSET_X,
            y: g.stringY(s) - STRING_GAP / 2 + INSET_Y,
            width: c.w - INSET_X * 2,
            height: STRING_GAP - INSET_Y * 2,
            rx: 8,
          };
          return (
            <g key={`t${s}-${c.fret}`}>
              <rect
                {...tile}
                className={styles.tile}
                style={{ fill: heatColour(cell.band) }}
                data-testid="heat-tile"
                data-band={cell.band}
                data-slow={cell.slow}
                data-cell={`s${s}f${c.fret}`}
              />
              {cell.slow && (
                <rect {...tile} className={styles.slow} style={{ fill: `url(#${hatchId})` }} />
              )}
            </g>
          );
        }),
      )}

      {selected && selectedCell && (
        <rect
          className={styles.selected}
          x={selectedCell.x + 1}
          y={g.stringY(selected.string) - STRING_GAP / 2 + 2}
          width={selectedCell.w - 2}
          height={STRING_GAP - 4}
          rx={10}
          data-testid="heat-selected"
        />
      )}

      {allStrings(tuning).map((s) =>
        g.cells.map((c) => {
          const pos = { string: s, fret: c.fret };
          const cell = byKey.get(`${s}:${c.fret}`);
          const isSelected = selected?.string === s && selected.fret === c.fret;
          return (
            <rect
              key={`hit${s}-${c.fret}`}
              className={styles.hit}
              x={c.x}
              y={g.stringY(s) - STRING_GAP / 2}
              width={c.w}
              height={STRING_GAP}
              role="button"
              tabIndex={0}
              aria-pressed={isSelected}
              aria-label={
                cell ? cellSummary(cell, tuning, accidentalPref) : `string ${s}, fret ${c.fret}`
              }
              data-cell={`s${s}f${c.fret}`}
              onClick={() => onSelect?.(pos)}
              onKeyDown={(e) => onKey(e, pos)}
            />
          );
        }),
      )}
    </svg>
  );
}
