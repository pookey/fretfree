import { forecastSentence, type StringForecast } from './aggregate';
import styles from './Heatmap.module.css';

/** Per-string retention forecasts from FSRS retrievability (design §7 Progress). */
export function RetentionForecast({
  forecasts,
  forecastDays,
}: {
  forecasts: readonly StringForecast[];
  forecastDays: number;
}) {
  const practised = forecasts.filter((f) => f.recall !== null);
  return (
    <div className={styles.forecast} data-testid="retention-forecast">
      <h3 className={styles.detailTitle}>Retention forecast</h3>
      {practised.length === 0 ? (
        <p className={styles.muted}>
          Practise a session and you'll see how much you'll remember of each string next week.
        </p>
      ) : (
        <ul>
          {practised.map((f) => (
            <li key={f.string} data-testid={`forecast-string-${f.string}`}>
              {forecastSentence(f, forecastDays)}{' '}
              <span className={styles.muted}>
                ({f.practised} {f.practised === 1 ? 'card' : 'cards'} practised)
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
