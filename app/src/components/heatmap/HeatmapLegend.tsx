import { bandLabels } from './aggregate';
import { HEAT_COLOURS } from './palette';
import styles from './Heatmap.module.css';

/**
 * The key to the mastery map: one swatch per stability band (low → high), plus
 * the two non-colour cues, an empty cell and a faded dashed "slow" tile.
 */
export function HeatmapLegend({
  bounds,
  targetMs,
}: {
  bounds: readonly number[];
  targetMs: number;
}) {
  const labels = bandLabels(bounds);
  return (
    <div className={styles.legend} data-testid="heatmap-legend">
      <p className={styles.legendTitle} id="heatmap-legend-title">
        Memory stability: how long until recall drops to 90%
      </p>
      <ol className={styles.scale} aria-labelledby="heatmap-legend-title">
        {labels.map((label, band) => (
          <li key={label} data-band={band}>
            <span
              className={styles.swatch}
              style={{ background: HEAT_COLOURS[band] }}
              aria-hidden="true"
            />
            {label}
          </li>
        ))}
      </ol>
      <ul className={styles.cues}>
        <li>
          <span className={`${styles.swatch} ${styles.swatchEmpty}`} aria-hidden="true" />
          Not practised yet
        </li>
        <li>
          <span className={`${styles.swatch} ${styles.swatchSlow}`} aria-hidden="true" />
          Faded and dashed: slow (median answer over {(targetMs / 1000).toFixed(1)}s)
        </li>
      </ul>
    </div>
  );
}
