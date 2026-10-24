import type { CSSProperties, ReactNode } from 'react';
import type { FormReadingPrompt, SheetBar } from './logic';
import {
  BAR_REACH,
  HEAD_RX,
  LINE_Y,
  SHEET_H,
  STEM_DX,
  STEM_TOP,
  VOLTA_Y,
  layoutBar,
} from './sheet';
import { barLabel, countText } from './text';
import styles from './FormSheet.module.css';

/**
 * How a bar is marked. `correct`, `wrong` and `expected` are feedback, told
 * apart by fill and edge style as well as colour (design §8); `asked` rings
 * the bar a "which bar next?" card asks about.
 */
export type BarState = 'correct' | 'wrong' | 'expected' | 'asked';

export interface FormSheetProps {
  prompt: FormReadingPrompt;
  /** Number the bars ("Pickup", 1, 2…); a pickup card hides them until answered. */
  numbered: boolean;
  /** Each bar's count under it (guide level 3 on a pickup card). */
  counts?: boolean;
  states?: ReadonlyMap<number, BarState>;
  /** The steps of the play order tapped on each bar. */
  badges?: ReadonlyMap<number, readonly number[]>;
  /** The bar sounding now. */
  playing?: number | null;
  /** Makes each bar a button. */
  onTap?: (index: number) => void;
  disabled?: boolean;
}

const INK = 'currentColor';

/** Feedback marks carry a glyph as well as a colour (design §8). */
const MARK: Record<string, string> = { correct: '✓ ', wrong: '✗ ' };

function Barline({ x, thick = false }: { x: number; thick?: boolean }) {
  return thick ? (
    <rect x={x} y={LINE_Y - BAR_REACH} width={4} height={BAR_REACH * 2} fill={INK} />
  ) : (
    <line
      x1={x}
      x2={x}
      y1={LINE_Y - BAR_REACH}
      y2={LINE_Y + BAR_REACH}
      stroke={INK}
      strokeWidth={1.6}
    />
  );
}

function RepeatDots({ x }: { x: number }) {
  return (
    <>
      <circle cx={x} cy={LINE_Y - 7} r={2.6} fill={INK} />
      <circle cx={x} cy={LINE_Y + 7} r={2.6} fill={INK} />
    </>
  );
}

interface BarDrawingProps {
  bar: SheetBar;
  meter: string;
  first: boolean;
  last: boolean;
  /** The bars either side, for barlines and ending brackets. */
  prev?: SheetBar;
  next?: SheetBar;
}

/** One bar as notation draws it: its signs, its notes, its barline and any ending bracket. */
function BarDrawing({ bar, meter, first, last, prev, next }: BarDrawingProps) {
  const layout = layoutBar(bar.rhythm, meter, {
    timeSignature: first,
    repeatStart: bar.repeatStart,
    repeatEnd: bar.repeatEnd,
  });
  const w = layout.width;
  const [top, bottom] = meter.split('/');
  const repeatAt = first ? layout.noteStart - 20 : 1;
  const endingStart = bar.ending !== undefined && prev?.ending !== bar.ending;
  const endingEnd = bar.ending !== undefined && next?.ending !== bar.ending;
  // A 1st ending is closed at its end; a 2nd is left open, as printed.
  const closed = endingEnd && bar.ending === 1;

  let right: ReactNode;
  if (bar.repeatEnd) {
    right = (
      <>
        <RepeatDots x={w - 14} />
        <Barline x={w - 9} />
        <Barline x={w - 5} thick />
      </>
    );
  } else if (last) {
    right = (
      <>
        <Barline x={w - 9} />
        <Barline x={w - 5} thick />
      </>
    );
  } else if (!next?.repeatStart) {
    // A begin repeat next door draws the barline itself.
    right = <Barline x={w - 0.8} />;
  }

  const style = { '--bar-w': w / SHEET_H } as CSSProperties;
  return (
    <svg
      className={styles.drawing}
      viewBox={`0 0 ${w} ${SHEET_H}`}
      style={style}
      aria-hidden="true"
      focusable="false"
    >
      <line x1={0} x2={w} y1={LINE_Y} y2={LINE_Y} stroke={INK} strokeWidth={1.6} />
      {first && (
        <g className={styles.time} textAnchor="middle" fill={INK}>
          <text x={22} y={LINE_Y - 3}>
            {top}
          </text>
          <text x={22} y={LINE_Y + 19}>
            {bottom}
          </text>
        </g>
      )}
      {bar.repeatStart && (
        <g data-sign="repeat-start">
          <Barline x={repeatAt} thick />
          <Barline x={repeatAt + 8} />
          <RepeatDots x={repeatAt + 13} />
        </g>
      )}
      {layout.notes.map((n, i) => (
        <g key={i}>
          <ellipse
            cx={n.x}
            cy={LINE_Y}
            rx={HEAD_RX}
            ry={4.6}
            transform={`rotate(-20 ${n.x} ${LINE_Y})`}
            fill={n.hollow ? 'none' : INK}
            stroke={INK}
            strokeWidth={n.hollow ? 2 : 1}
          />
          {n.stem && (
            <line
              x1={n.x + STEM_DX}
              x2={n.x + STEM_DX}
              y1={LINE_Y - 1}
              y2={STEM_TOP}
              stroke={INK}
              strokeWidth={1.8}
            />
          )}
          {Array.from({ length: n.flags }, (_, f) => (
            <path
              key={f}
              d={`M${n.x + STEM_DX} ${STEM_TOP + f * 7} q 2 6 8 9 q -4 -1 -8 -3`}
              fill={INK}
              stroke={INK}
              strokeWidth={1.4}
            />
          ))}
          {n.dots > 0 && <circle cx={n.x + 11} cy={LINE_Y - 3} r={2.3} fill={INK} />}
        </g>
      ))}
      {layout.beams.map(([x1, x2], i) => (
        <rect key={i} x={x1 - 0.9} y={STEM_TOP} width={x2 - x1 + 1.8} height={5} fill={INK} />
      ))}
      {right && <g data-sign={bar.repeatEnd ? 'repeat-end' : 'barline'}>{right}</g>}
      {bar.ending !== undefined && (
        <g data-sign={`ending-${bar.ending}`} fill={INK}>
          <line
            x1={endingStart ? 3 : 0}
            x2={closed ? w - 3 : w}
            y1={VOLTA_Y}
            y2={VOLTA_Y}
            stroke={INK}
            strokeWidth={1.6}
          />
          {endingStart && (
            <>
              <line x1={3} x2={3} y1={VOLTA_Y} y2={VOLTA_Y + 15} stroke={INK} strokeWidth={1.6} />
              <text className={styles.volta} x={8} y={VOLTA_Y + 15}>
                {bar.ending}.
              </text>
            </>
          )}
          {closed && (
            <line
              x1={w - 3}
              x2={w - 3}
              y1={VOLTA_Y}
              y2={VOLTA_Y + 15}
              stroke={INK}
              strokeWidth={1.6}
            />
          )}
        </g>
      )}
    </svg>
  );
}

/**
 * The tune on one rhythm staff, a bar per item, wrapping as a line of music
 * does (design §7: wide first, then onto more lines). Bars are buttons when
 * the card is answered by tapping one; each is ≥44pt.
 */
export function FormSheet({
  prompt,
  numbered,
  counts = false,
  states,
  badges,
  playing = null,
  onTap,
  disabled = false,
}: FormSheetProps) {
  const { bars, meter } = prompt;
  return (
    <ol className={styles.sheet} aria-label="The tune" data-testid="form-sheet">
      {bars.map((bar, i) => {
        const label = barLabel(prompt, i, numbered);
        const steps = badges?.get(i) ?? [];
        const body = (
          <>
            <BarDrawing
              bar={bar}
              meter={meter}
              first={i === 0}
              last={i === bars.length - 1}
              prev={bars[i - 1]}
              next={bars[i + 1]}
            />
            <span className={styles.caption} aria-hidden="true">
              {MARK[states?.get(i) ?? ''] ?? ''}
              {numbered ? (bar.number ?? 'Pickup') : ' '}
            </span>
            {counts && (
              <span className={styles.count} aria-hidden="true">
                {countText(bar.rhythm, meter)}
              </span>
            )}
            {badges && (
              <span className={styles.badges} aria-hidden="true">
                {steps.map((s) => (
                  <span key={s} className={styles.badge}>
                    {s}
                  </span>
                ))}
              </span>
            )}
          </>
        );
        return (
          <li
            key={i}
            className={styles.item}
            data-state={states?.get(i)}
            data-playing={playing === i || undefined}
            data-testid="form-bar"
          >
            {onTap ? (
              <button
                type="button"
                className={styles.bar}
                onClick={() => onTap(i)}
                disabled={disabled}
                aria-label={steps.length ? `${label}, tapped ${steps.join(' and ')}` : label}
              >
                {body}
              </button>
            ) : (
              <div className={styles.bar} role="img" aria-label={label}>
                {body}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
