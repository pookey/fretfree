import { useId, useMemo, useState } from 'react';
import { useAppStore } from '../../../app-store';
import { TimeChart } from '../../../components/charts/TimeChart';
import { seconds } from '../../../components/charts/scale';
import { speedTargets } from '../../../engine';
import { toLocalDate } from '../../../engine/gamification/local-date';
import { knownHistory, replayItems, speedByDay, speedDrills } from '../../../engine/history';
import { getDrill } from '../../../drills/registry';
import type { PanelProps } from '../registry';
import { useHistoryData, useReplayDeps, type HistoryData } from './load';
import styles from './History.module.css';

const count = (v: number) => String(Math.round(v));

/** Learning and stable items at the end of each day (research/02 rule 15). */
function KnownChart({ data }: { data: HistoryData }) {
  const deps = useReplayDeps();
  const days = useMemo(() => {
    const timelines = replayItems(data.cards, data.logs, deps);
    return knownHistory({ ...data, timelines, today: toLocalDate(data.now) });
  }, [data, deps]);
  const today = days.at(-1);
  if (!today) return null;
  const first = days[0];
  const gained = first && days.length > 1 ? today.learning - first.learning : null;
  return (
    <div className={styles.block}>
      <h3 className={styles.title}>What you know</h3>
      <p className={styles.headline} data-testid="known-headline">
        {today.learning} learning, {today.stable} of them stable
        {gained !== null && gained > 0 && (
          <span className={styles.muted}> · up {gained} since day 1</span>
        )}
      </p>
      <TimeChart
        kind="area"
        testId="known-chart"
        label="Cards you know, by day"
        summary={`Today: ${today.learning} learning, ${today.stable} of them stable.`}
        dates={days.map((d) => d.date)}
        series={[
          {
            id: 'stable',
            label: 'Stable',
            colour: 'var(--chart-stable)',
            values: days.map((d) => d.stable),
          },
          {
            id: 'learning',
            label: 'Learning, not yet stable',
            colour: 'var(--chart-learning)',
            values: days.map((d) => d.learning - d.stable),
          },
        ]}
        totalLabel="Learning"
        integer
        format={count}
      />
      <p className={styles.note}>
        Learning: your latest answer was right. Stable: you’ll very likely still know it a week from
        now without practice, which takes reviews spread over several days. Past days are rebuilt
        from your answers.
      </p>
    </div>
  );
}

/** The median time of correct answers per day, one drill at a time (design §3.2 fluency). */
function SpeedChart({ data }: { data: HistoryData }) {
  const selectId = useId();
  const deps = useReplayDeps();
  const latencyBaselineMs = useAppStore((s) => s.settings.latencyBaselineMs);
  const targets = useMemo(() => speedTargets(latencyBaselineMs), [latencyBaselineMs]);
  const drills = useMemo(() => speedDrills(data.logs, deps.isPlacement), [data, deps]);
  const [chosen, setChosen] = useState<string | null>(null);
  const drillType =
    chosen && drills.some((d) => d.drillType === chosen) ? chosen : drills[0]?.drillType;
  const days = useMemo(
    () => (drillType ? speedByDay(data.logs, drillType, deps.isPlacement) : []),
    [data, drillType, deps],
  );
  if (!drillType) return null;
  const name = (id: string) => getDrill(id)?.title ?? id;
  const first = days[0];
  const last = days.at(-1);
  const change =
    first && last && days.length > 1
      ? Math.round((1 - last.medianMs / first.medianMs) * 100)
      : null;
  return (
    <div className={styles.block}>
      <div className={styles.heading}>
        <h3 className={styles.title}>Speed</h3>
        {drills.length > 1 && (
          <label className={styles.select} htmlFor={selectId}>
            <span>Drill</span>
            <select
              id={selectId}
              value={drillType}
              onChange={(e) => setChosen(e.target.value)}
              data-testid="speed-drill"
            >
              {drills.map((d) => (
                <option key={d.drillType} value={d.drillType}>
                  {name(d.drillType)}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <p className={styles.headline} data-testid="speed-headline">
        {last ? `${seconds(last.medianMs)} on your latest day` : ''}
        {change !== null && change > 0 && (
          <span className={styles.muted}> · {change}% faster than your first day</span>
        )}
        {change !== null && change <= 0 && (
          <span className={styles.muted}> · new or harder notes slow this down for a while</span>
        )}
      </p>
      <TimeChart
        kind="line"
        testId="speed-chart"
        label={`${name(drillType)}: median answer time by day`}
        summary={last ? `Latest: ${seconds(last.medianMs)}.` : ''}
        dates={days.map((d) => d.date)}
        series={[
          {
            id: 'speed',
            label: 'Median time',
            colour: 'var(--tone)',
            values: days.map((d) => d.medianMs),
          },
        ]}
        reference={{ value: targets.targetMs, label: `Target ${seconds(targets.targetMs)}` }}
        format={seconds}
      />
      <p className={styles.note}>
        The middle time of your correct answers each day, without guides. Lower is faster; under the
        target counts towards mastery.
      </p>
    </div>
  );
}

/** "Over time" on Progress: what you know and how fast, day by day. */
export default function OverTime({ revision }: PanelProps) {
  const data = useHistoryData(revision);
  const empty = data !== null && data.logs.length === 0 && data.cards.length === 0;
  return (
    <div className={styles.panel} data-testid="over-time-panel" data-loaded={data !== null}>
      {empty && <p className={styles.muted}>Practise a session to start your history.</p>}
      {data && !empty && (
        <>
          <KnownChart data={data} />
          <SpeedChart data={data} />
        </>
      )}
    </div>
  );
}
