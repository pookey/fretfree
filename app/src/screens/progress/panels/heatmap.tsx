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
import { shortDate } from '../../../components/charts/scale';
import styles from '../../../components/heatmap/Heatmap.module.css';
import { ENGINE_CONFIG, createScheduler, speedTargets } from '../../../engine';
import {
  addDays,
  daysBetween,
  toLocalDate,
  type LocalDate,
} from '../../../engine/gamification/local-date';
import { cardsAsOf, endOfLocalDay, firstActiveDate, replayItems } from '../../../engine/history';
import { useSizeClass } from '../../../shell/size-class';
import { getDb } from '../../../storage';
import { getTuning, type Position } from '../../../theory';
import { useReplayDeps } from '../history/load';
import type { PanelProps } from '../registry';

export const id = 'heatmap';
export const order = 5;
export const title = 'Mastery map';

const EPOCH = new Date(0);

/**
 * The fretboard heatmap and retention forecast (design §7 Progress, research/02
 * rule 15): visible competence, straight from the FSRS state. The whole
 * 15-fret neck on regular-wide; 12 frets (the range the neck skills cover)
 * on narrower windows, scrolling sideways if it must to keep 44pt cells.
 * A slider rewinds the neck to any day since the first, from the replayed
 * review history (`engine/history`), so the map visibly fills in.
 */
export function Panel({ revision }: PanelProps) {
  const {
    handedness,
    tuning: tuningId,
    latencyBaselineMs,
    accidentalPref,
    fsrsParams,
  } = useAppStore((s) => s.settings);
  const fsrsWeights = fsrsParams?.w;
  const retrievability = useMemo(
    () => createScheduler({ weights: fsrsWeights }).retrievability,
    [fsrsWeights],
  );
  const sizeClass = useSizeClass();
  const [loaded, setLoaded] = useState<{ data: HeatmapData; now: Date } | null>(null);
  const [selected, setSelected] = useState<Position | null>(null);
  const [asOf, setAsOf] = useState<LocalDate | null>(null);
  const replayDeps = useReplayDeps();

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
  const today = loaded ? toLocalDate(loaded.now) : null;
  const firstDay = useMemo(
    () => (loaded ? firstActiveDate(loaded.data.cards, loaded.data.logs) : null),
    [loaded],
  );
  const span = firstDay && today && firstDay < today ? daysBetween(firstDay, today) : 0;
  const timelines = useMemo(
    () =>
      loaded && span > 0 ? replayItems(loaded.data.cards, loaded.data.logs, replayDeps) : null,
    [loaded, span, replayDeps],
  );
  const shown = useMemo(() => {
    if (!loaded || !timelines || !asOf || !today || asOf >= today) return loaded;
    const end = endOfLocalDay(asOf);
    return {
      data: { cards: cardsAsOf(timelines, end), logs: loaded.data.logs.filter((l) => l.at <= end) },
      now: end,
    };
  }, [loaded, timelines, asOf, today]);
  const cells = useMemo(
    () =>
      buildHeatmap({
        cards: shown?.data.cards ?? [],
        logs: shown?.data.logs ?? [],
        fretRange,
        targets,
        now: shown?.now ?? EPOCH,
        retrievability,
        tuning,
      }),
    [shown, fretRange, targets, retrievability, tuning],
  );
  const forecasts = useMemo(
    () =>
      forecastByString({
        cards: loaded?.data.cards ?? [],
        now: loaded?.now ?? EPOCH,
        retrievability,
        tuning,
      }),
    [loaded, retrievability, tuning],
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
          accidentalPref={accidentalPref}
          selected={selected}
          onSelect={setSelected}
        />
      </div>
      {span > 0 && firstDay && (
        <label className={styles.timeline}>
          <span>Map on</span>
          <input
            type="range"
            min={0}
            max={span}
            step={1}
            value={asOf ? daysBetween(firstDay, asOf) : span}
            onChange={(e) => {
              const date = addDays(firstDay, Number(e.target.value));
              setAsOf(date === today ? null : date);
            }}
            aria-label="Show the map as it was on"
            aria-valuetext={asOf ? shortDate(asOf) : 'Today'}
            data-testid="heatmap-as-of"
          />
          <output data-testid="heatmap-as-of-date">{asOf ? shortDate(asOf) : 'Today'}</output>
        </label>
      )}
      <HeatmapLegend bounds={stabilityBandsDays} targetMs={targets.targetMs} />
      <div className={styles.columns}>
        <CellDetail
          cell={selectedCell}
          now={shown?.now ?? EPOCH}
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
