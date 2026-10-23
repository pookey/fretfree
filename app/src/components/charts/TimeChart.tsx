import { useLayoutEffect, useRef, useState, type PointerEvent } from 'react';
import type { LocalDate } from '../../engine/gamification/local-date';
import { labelIndices, niceTicks, shortDate } from './scale';
import styles from './Chart.module.css';

export interface ChartSeries {
  id: string;
  label: string;
  /** A CSS colour, normally a token: `var(--chart-stable)`. */
  colour: string;
  /** One value per date; null is a day with no value. */
  values: readonly (number | null)[];
}

export interface TimeChartProps {
  /** Area stacks the series bottom-up; line and bar draw the first series only. */
  kind: 'area' | 'line' | 'bar';
  dates: readonly LocalDate[];
  series: readonly ChartSeries[];
  /** The chart's accessible name. */
  label: string;
  /** A sentence for screen readers: the headline the chart shows. */
  summary: string;
  format(value: number): string;
  /** Whole-number y ticks, for counts. */
  integer?: boolean;
  /** A dashed reference line, such as a speed target. */
  reference?: { value: number; label: string };
  /** For a stacked area: also show the stack's total under this name. */
  totalLabel?: string;
  /** The x label and tooltip date; defaults to "23 Oct". */
  formatDate?(date: LocalDate): string;
  testId?: string;
}

const HEIGHT = 200;
const M = { top: 12, right: 12, bottom: 26, left: 44 };
const DEFAULT_WIDTH = 640;

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      if (el.clientWidth > 0) setWidth(el.clientWidth);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, width };
}

/** A bar with its data end rounded (4px) and its base square on the baseline. */
function barPath(x: number, y: number, w: number, h: number, round: boolean): string {
  if (h <= 0) return '';
  const r = round ? Math.min(4, w / 2, h) : 0;
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

/**
 * A small daily chart for Progress (design §7): SVG at the container's
 * width, recessive grid, a crosshair tooltip on hover or tap, a legend for
 * two or more series and the same numbers as a table.
 */
export function TimeChart(props: TimeChartProps) {
  const { kind, dates, label, summary, format, reference, totalLabel, integer, testId } = props;
  const formatDate = props.formatDate ?? shortDate;
  const series = kind === 'area' ? props.series : props.series.slice(0, 1);
  const { ref, width } = useWidth();
  const [hover, setHover] = useState<number | null>(null);

  const n = dates.length;
  const plotW = Math.max(1, width - M.left - M.right);
  const plotH = HEIGHT - M.top - M.bottom;
  // A single day has no line to draw, so an area shows as a column.
  const asBars = kind === 'bar' || n === 1;
  const band = plotW / Math.max(1, n);
  const xAt = (i: number) =>
    asBars ? M.left + (i + 0.5) * band : M.left + (n === 1 ? plotW / 2 : (i * plotW) / (n - 1));

  const stacks = dates.map((_, i) => {
    let sum = 0;
    return series.map((s) => {
      const lower = sum;
      sum += s.values[i] ?? 0;
      return { lower, upper: sum };
    });
  });
  const totals = stacks.map((st) => st.at(-1)?.upper ?? 0);
  const ticks = niceTicks(Math.max(...totals, reference?.value ?? 0, 0), 4, integer);
  const top = ticks.at(-1) ?? 1;
  const yAt = (v: number) => M.top + plotH - (v / top) * plotH;
  const barW = Math.max(4, Math.min(28, band * 0.6));

  const pointAt = (e: PointerEvent<SVGRectElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - box.left) / Math.max(1, box.width)) * plotW;
    const i = asBars ? Math.floor(x / band) : Math.round((x / plotW) * (n - 1));
    if (n === 0 || !Number.isFinite(i)) return;
    setHover(Math.max(0, Math.min(n - 1, i)));
  };

  const xLabels = labelIndices(n, Math.max(2, Math.floor(plotW / 64)));
  const hovered = hover === null ? null : { i: hover, x: xAt(hover) };

  return (
    <figure className={styles.chart} data-testid={testId}>
      {series.length > 1 && (
        <ul className={styles.legend}>
          {series.map((s) => (
            <li key={s.id}>
              <span className={styles.swatch} style={{ background: s.colour }} aria-hidden />
              {s.label}
            </li>
          ))}
        </ul>
      )}
      <div ref={ref} className={styles.plot}>
        <svg
          role="img"
          aria-label={`${label}. ${summary}`}
          width={width}
          height={HEIGHT}
          viewBox={`0 0 ${width} ${HEIGHT}`}
          className={styles.svg}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line
                className={styles.grid}
                x1={M.left}
                x2={M.left + plotW}
                y1={yAt(t)}
                y2={yAt(t)}
              />
              <text className={styles.tick} x={M.left - 6} y={yAt(t)} dy="0.32em" textAnchor="end">
                {format(t)}
              </text>
            </g>
          ))}
          {xLabels.map((i) => (
            <text
              key={i}
              className={styles.tick}
              x={xAt(i)}
              y={HEIGHT - 6}
              textAnchor={
                n > 1 && !asBars && i === 0
                  ? 'start'
                  : n > 1 && !asBars && i === n - 1
                    ? 'end'
                    : 'middle'
              }
            >
              {formatDate(dates[i] as LocalDate)}
            </text>
          ))}

          {asBars &&
            dates.map((date, i) =>
              series.map((s, k) => {
                const st = stacks[i]?.[k];
                if (!st || st.upper === st.lower) return null;
                const y = yAt(st.upper);
                // A 2px surface gap between stacked segments.
                const h = yAt(st.lower) - y - (k > 0 ? 2 : 0);
                const isTop =
                  k === series.length - 1 ||
                  stacks[i]?.slice(k + 1).every((o) => o.upper === o.lower);
                return (
                  <path
                    key={`${date}-${s.id}`}
                    d={barPath(xAt(i) - barW / 2, y, barW, h, Boolean(isTop))}
                    style={{ fill: s.colour }}
                  />
                );
              }),
            )}

          {!asBars &&
            kind === 'area' &&
            series.map((s, k) => {
              const upper = stacks.map((st, i) => `${xAt(i)},${yAt(st[k]?.upper ?? 0)}`);
              const lower = stacks.map((st, i) => `${xAt(i)},${yAt(st[k]?.lower ?? 0)}`).reverse();
              return (
                <g key={s.id}>
                  <path
                    className={styles.area}
                    d={`M${upper.join('L')}L${lower.join('L')}Z`}
                    style={{ fill: s.colour }}
                  />
                  <path
                    className={styles.line}
                    d={`M${upper.join('L')}`}
                    style={{ stroke: s.colour }}
                  />
                </g>
              );
            })}

          {!asBars &&
            kind === 'line' &&
            series.map((s) => {
              const points = s.values.flatMap((v, i) => (v === null ? [] : [{ i, v }]));
              return (
                <g key={s.id}>
                  <path
                    className={styles.line}
                    d={`M${points.map((p) => `${xAt(p.i)},${yAt(p.v)}`).join('L')}`}
                    style={{ stroke: s.colour }}
                  />
                  {points.map((p) => (
                    <circle
                      key={p.i}
                      className={styles.marker}
                      cx={xAt(p.i)}
                      cy={yAt(p.v)}
                      r={4}
                      style={{ fill: s.colour }}
                    />
                  ))}
                </g>
              );
            })}

          {reference && (
            <g>
              <line
                className={styles.reference}
                x1={M.left}
                x2={M.left + plotW}
                y1={yAt(reference.value)}
                y2={yAt(reference.value)}
              />
              <text
                className={styles.referenceLabel}
                x={M.left + plotW}
                y={yAt(reference.value) - 5}
                textAnchor="end"
              >
                {reference.label}
              </text>
            </g>
          )}

          {hovered && (
            <line
              className={styles.crosshair}
              x1={hovered.x}
              x2={hovered.x}
              y1={M.top}
              y2={M.top + plotH}
            />
          )}

          <rect
            className={styles.hit}
            x={M.left}
            y={M.top}
            width={plotW}
            height={plotH}
            onPointerMove={pointAt}
            onPointerDown={pointAt}
            onPointerLeave={() => setHover(null)}
          />
        </svg>
        {hovered && (
          <div
            className={styles.tooltip}
            aria-hidden
            data-testid={testId ? `${testId}-tooltip` : undefined}
            style={{
              left: Math.min(Math.max(hovered.x, 80), width - 80),
            }}
          >
            <strong>{formatDate(dates[hovered.i] as LocalDate)}</strong>
            {series.map((s) => {
              const v = s.values[hovered.i];
              return (
                <span key={s.id} className={styles.tooltipRow}>
                  <span className={styles.swatch} style={{ background: s.colour }} />
                  {s.label}: {v === null || v === undefined ? '—' : format(v)}
                </span>
              );
            })}
            {totalLabel && (
              <span className={styles.tooltipRow}>
                {totalLabel}: {format(totals[hovered.i] ?? 0)}
              </span>
            )}
          </div>
        )}
      </div>
      <details className={styles.table}>
        <summary>Show the numbers</summary>
        <table>
          <caption className={styles.hidden}>{label}</caption>
          <thead>
            <tr>
              <th scope="col">Day</th>
              {series.map((s) => (
                <th key={s.id} scope="col">
                  {s.label}
                </th>
              ))}
              {totalLabel && <th scope="col">{totalLabel}</th>}
            </tr>
          </thead>
          <tbody>
            {dates.map((date, i) => (
              <tr key={date}>
                <th scope="row">{formatDate(date)}</th>
                {series.map((s) => {
                  const v = s.values[i];
                  return <td key={s.id}>{v === null || v === undefined ? '—' : format(v)}</td>;
                })}
                {totalLabel && <td>{format(totals[i] ?? 0)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
