import { useMemo, type CSSProperties, type KeyboardEvent } from 'react';
import type { GuideLevel } from '../../engine/model';
import { STANDARD_TUNING, stringCount, type Tuning } from '../../theory';
import { tabEventLabel, tabLines, type TabEvent } from '../../theory/tab';
import { LINE_GAP, MAX_SCALE, computeTabGeometry, minScale, noteColumns } from './geometry';
import { showsLineName, tabGuide } from './guide';
import styles from './TabStaff.module.css';

/**
 * `current` is the note being asked about or the phrase cursor, `correct`
 * flashes, `ghost` previews a note. Every style differs in shape as well as
 * colour.
 */
export type TabNoteStyle = 'plain' | 'current' | 'correct' | 'wrong' | 'ghost';

export interface TabNote extends TabEvent {
  style?: TabNoteStyle;
  /** Draw `?` instead of the fret (the fret is the answer being asked for). */
  hideFret?: boolean;
}

/** `selected` marks a picked line; `correct` flashes; `wrong` is dashed. */
export type TabLineStyle = 'selected' | 'correct' | 'wrong';

export interface TabLineMark {
  string: number;
  style: TabLineStyle;
}

export interface TabStaffProps {
  tuning?: Tuning;
  /** The notes, in playing order, one column each. */
  notes?: readonly TabNote[];
  /** Columns to draw at least; fewer notes sit in the middle. */
  minColumns?: number;
  /** Index into `notes` of the phrase cursor: drawn `current` with a caret below. */
  cursor?: number;
  lineMarks?: readonly TabLineMark[];
  /** String-name guide fading (docs/design/tab-track.md). */
  guideLevel?: GuideLevel;
  /** Makes each line a ≥ 44pt button for picking a string. */
  onPickLine?: (string: number) => void;
  /** Accessible name for the whole staff. */
  label?: string;
  className?: string;
}

/**
 * Six-line tab (design §8, docs/design/tab-track.md): the top line is string 1
 * (high E), fret numbers sit on the lines. Pure presentation; the model is
 * `theory/tab`.
 */
export function TabStaff({
  tuning = STANDARD_TUNING,
  notes = [],
  minColumns = 0,
  cursor,
  lineMarks = [],
  guideLevel = 3,
  onPickLine,
  label = 'Tab',
  className,
}: TabStaffProps) {
  const lines = tabLines(tuning);
  const count = stringCount(tuning);
  const { columns, offset } = noteColumns(notes.length, minColumns);
  const g = useMemo(() => computeTabGeometry({ lineCount: count, columns }), [count, columns]);
  const guide = tabGuide(guideLevel);
  const marks = new Map(lineMarks.map((m) => [m.string, m.style]));
  const interactive = Boolean(onPickLine);

  const onKey = (e: KeyboardEvent, string: number) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onPickLine?.(string);
    }
  };

  const styleOf = (n: TabNote, i: number): TabNoteStyle =>
    n.style ?? (i === cursor ? 'current' : 'plain');

  return (
    <svg
      className={[styles.staff, className].filter(Boolean).join(' ')}
      viewBox={`0 0 ${g.width} ${g.height}`}
      style={
        {
          '--tab-min': `${Math.ceil(g.width * minScale())}px`,
          '--tab-max': `${Math.ceil(g.width * MAX_SCALE)}px`,
        } as CSSProperties
      }
      role="group"
      aria-label={label}
      data-guide-level={guideLevel}
      data-columns={columns}
    >
      {lines.map(({ string }) => {
        const mark = marks.get(string);
        return mark ? (
          <rect
            key={`band${string}`}
            className={`${styles.band} ${styles[mark]}`}
            x={g.staffLeft}
            y={g.lineY(string) - 14}
            width={g.staffRight - g.staffLeft}
            height={28}
            rx={6}
          />
        ) : null;
      })}

      {lines.map(({ string }) => {
        const mark = marks.get(string);
        return (
          <line
            key={`l${string}`}
            className={[styles.line, mark && styles[`${mark}Line`]].filter(Boolean).join(' ')}
            x1={g.staffLeft}
            x2={g.staffRight}
            y1={g.lineY(string)}
            y2={g.lineY(string)}
            data-testid="tab-line"
            data-string={string}
            data-mark={mark}
          />
        );
      })}

      {[g.staffLeft, g.staffRight].map((x) => (
        <line
          key={`bar${x}`}
          className={styles.bar}
          x1={x}
          x2={x}
          y1={g.lineY(1)}
          y2={g.lineY(count)}
        />
      ))}

      {lines
        .filter(({ string }) => showsLineName(guide, string, count))
        .map(({ string, name }) => (
          <text
            key={`name${string}`}
            className={styles.name}
            x={g.nameX}
            y={g.lineY(string)}
            dy="0.35em"
            data-testid="tab-line-name"
            data-string={string}
          >
            {name}
            {guide.numbers && (
              <tspan className={styles.number} dx="0.2em">
                {string}
              </tspan>
            )}
          </text>
        ))}

      {notes.map((n, i) => {
        const style = styleOf(n, i);
        const cx = g.columnX(offset + i);
        const cy = g.lineY(n.string);
        const text = n.hideFret ? '?' : String(n.fret);
        const w = 14 + 12 * text.length;
        return (
          <g
            key={`n${i}`}
            className={`${styles.note} ${styles[style]}`}
            role="img"
            aria-label={n.hideFret ? `string ${n.string}, fret hidden` : tabEventLabel(n)}
            aria-current={i === cursor ? 'step' : undefined}
            data-testid="tab-note"
            data-string={n.string}
            data-fret={n.fret}
            data-style={style}
          >
            {style === 'correct' ? (
              <circle cx={cx} cy={cy} r={18} />
            ) : style === 'wrong' ? (
              <rect
                x={cx - 15}
                y={cy - 15}
                width={30}
                height={30}
                rx={3}
                transform={`rotate(45 ${cx} ${cy})`}
              />
            ) : (
              <rect x={cx - w / 2} y={cy - 16} width={w} height={32} rx={7} />
            )}
            <text x={cx} y={cy} dy="0.36em">
              {text}
            </text>
          </g>
        );
      })}

      {cursor !== undefined && cursor >= 0 && cursor < notes.length && (
        <path
          className={styles.caret}
          d={`M ${g.columnX(offset + cursor)} ${g.bottom + 2} l 8 12 h -16 z`}
          data-testid="tab-cursor"
          data-column={cursor}
        />
      )}

      {interactive &&
        lines.map(({ string, name }) => (
          <rect
            key={`hit${string}`}
            className={styles.hit}
            x={0}
            y={g.lineY(string) - LINE_GAP / 2}
            width={g.width}
            height={LINE_GAP}
            role="button"
            aria-label={
              showsLineName(guide, string, count) ? `string ${string}, ${name}` : `string ${string}`
            }
            aria-pressed={marks.get(string) === 'selected'}
            tabIndex={0}
            data-line={string}
            onPointerDown={() => onPickLine?.(string)}
            onKeyDown={(e) => onKey(e, string)}
          />
        ))}
    </svg>
  );
}
