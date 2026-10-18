import { STANDARD_TUNING, noteAt, type AccidentalPref, type Tuning } from '../../theory';
import { formatDays, formatDue, formatPercent, formatSeconds, type HeatCell } from './aggregate';
import styles from './Heatmap.module.css';

/** The stats behind one tapped cell. */
export function CellDetail({
  cell,
  now,
  targetMs,
  forecastDays,
  tuning = STANDARD_TUNING,
  accidentalPref = 'sharp',
}: {
  cell: HeatCell | null;
  now: Date;
  targetMs: number;
  forecastDays: number;
  tuning?: Tuning;
  accidentalPref?: AccidentalPref;
}) {
  if (!cell) {
    return (
      <div className={styles.detail} data-testid="heat-cell-detail" aria-live="polite">
        <p className={styles.muted}>Tap a cell to see its stats.</p>
      </div>
    );
  }
  const note = noteAt(cell, tuning, accidentalPref).pc;
  return (
    <div className={styles.detail} data-testid="heat-cell-detail" aria-live="polite">
      <h3 className={styles.detailTitle}>
        String {cell.string}, fret {cell.fret} · {note}
      </h3>
      {cell.stabilityDays === null ? (
        <p className={styles.muted}>Not practised yet. It joins your sessions as you unlock it.</p>
      ) : (
        <dl className={styles.facts}>
          <div>
            <dt>Stable for</dt>
            <dd data-testid="heat-stability">{formatDays(cell.stabilityDays)}</dd>
          </div>
          {cell.recallNow !== null && (
            <div>
              <dt>Recall now</dt>
              <dd>{formatPercent(cell.recallNow)}</dd>
            </div>
          )}
          {cell.recallForecast !== null && (
            <div>
              <dt>Recall in {forecastDays} days</dt>
              <dd data-testid="heat-forecast">{formatPercent(cell.recallForecast)}</dd>
            </div>
          )}
          <div>
            <dt>Median answer</dt>
            <dd data-testid="heat-median">
              {cell.medianMs === null ? '—' : formatSeconds(cell.medianMs)}
              {cell.slow && ` (target ${formatSeconds(targetMs)})`}
            </dd>
          </div>
          <div>
            <dt>Answers</dt>
            <dd data-testid="heat-answers">
              {cell.correct} of {cell.reviews} right
            </dd>
          </div>
          {cell.nextDue && (
            <div>
              <dt>Next review</dt>
              <dd>{formatDue(cell.nextDue, now)}</dd>
            </div>
          )}
        </dl>
      )}
    </div>
  );
}
