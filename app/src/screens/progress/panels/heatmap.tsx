import { liveQuery } from 'dexie';
import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '../../../app-store';
import {
  CellDetail,
  FretboardHeatmap,
  HeatmapLegend,
  RetentionForecast,
  buildHeatmap,
  forecastByString,
  loadHeatmapData,
  type HeatmapData,
} from '../../../components/heatmap';
import styles from '../../../components/heatmap/Heatmap.module.css';
import { ENGINE_CONFIG, createScheduler, speedTargets } from '../../../engine';
import { useSizeClass } from '../../../shell/size-class';
import { getDb } from '../../../storage';
import { getTuning, type Position } from '../../../theory';
import type { PanelProps } from '../registry';

export const id = 'heatmap';
export const order = 5;
export const title = 'Mastery map';

const scheduler = createScheduler();
const retrievability = scheduler.retrievability;
const EPOCH = new Date(0);

/**
 * The fretboard heatmap and retention forecast (design §7 Progress, research/02
 * rule 15): visible competence, straight from the FSRS state. The whole
 * 15-fret neck on regular-wide; 12 frets (the range the neck skills cover)
 * on narrower windows, scrolling sideways if it must to keep 44pt cells.
 */
export function Panel({ revision }: PanelProps) {
  const {
    handedness,
    tuning: tuningId,
    latencyBaselineMs,
    accidentalPref,
  } = useAppStore((s) => s.settings);
  const sizeClass = useSizeClass();
  const [loaded, setLoaded] = useState<{ data: HeatmapData; now: Date } | null>(null);
  const [selected, setSelected] = useState<Position | null>(null);

  useEffect(() => {
    const sub = liveQuery(() => loadHeatmapData(getDb())).subscribe({
      next: (data) => setLoaded({ data, now: new Date() }),
      error: (e: unknown) => console.error('Loading the heatmap failed', e),
    });
    return () => sub.unsubscribe();
  }, [revision]);

  const tuning = getTuning(tuningId);
  const targets = useMemo(() => speedTargets(latencyBaselineMs), [latencyBaselineMs]);
  const fretRange = useMemo(
    () => (sizeClass === 'regular-wide' ? { from: 0, to: 15 } : { from: 0, to: 12 }),
    [sizeClass],
  );
  const cells = useMemo(
    () =>
      buildHeatmap({
        cards: loaded?.data.cards ?? [],
        logs: loaded?.data.logs ?? [],
        fretRange,
        targets,
        now: loaded?.now ?? EPOCH,
        retrievability,
        tuning,
      }),
    [loaded, fretRange, targets, tuning],
  );
  const forecasts = useMemo(
    () =>
      forecastByString({
        cards: loaded?.data.cards ?? [],
        now: loaded?.now ?? EPOCH,
        retrievability,
        tuning,
      }),
    [loaded, tuning],
  );
  const selectedCell =
    (selected && cells.find((c) => c.string === selected.string && c.fret === selected.fret)) ||
    null;
  const { forecastDays, stabilityBandsDays } = ENGINE_CONFIG.heatmap;

  return (
    <div className={styles.panel} data-testid="heatmap-panel" data-loaded={loaded !== null}>
      <div className={styles.neckScroll}>
        <FretboardHeatmap
          cells={cells}
          fretRange={fretRange}
          tuning={tuning}
          handedness={handedness}
          selected={selected}
          onSelect={setSelected}
        />
      </div>
      <HeatmapLegend bounds={stabilityBandsDays} targetMs={targets.targetMs} />
      <div className={styles.columns}>
        <CellDetail
          cell={selectedCell}
          now={loaded?.now ?? EPOCH}
          targetMs={targets.targetMs}
          forecastDays={forecastDays}
          tuning={tuning}
          accidentalPref={accidentalPref}
        />
        <RetentionForecast forecasts={forecasts} forecastDays={forecastDays} />
      </div>
    </div>
  );
}
