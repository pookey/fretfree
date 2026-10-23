import { useMemo } from 'react';
import { useAppStore } from '../../../app-store';
import { TimeChart } from '../../../components/charts/TimeChart';
import { createScheduler, ENGINE_CONFIG } from '../../../engine';
import {
  dayOfWeek,
  daysBetween,
  toLocalDate,
  type LocalDate,
} from '../../../engine/gamification/local-date';
import { dueByDay, recallIfStopped } from '../../../engine/history';
import type { PanelProps } from '../registry';
import { useHistoryData } from './load';
import styles from './History.module.css';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Reviews due over the next week and how much would survive a month off
 * (design §7 retention forecasts, research/02 rule 15): spacing made visible.
 */
export default function ComingUp({ revision }: PanelProps) {
  const data = useHistoryData(revision);
  const weights = useAppStore((s) => s.settings.fsrsParams?.w);
  const retrievability = useMemo(() => createScheduler({ weights }).retrievability, [weights]);
  const today = data ? toLocalDate(data.now) : null;
  const days = useMemo(() => (data ? dueByDay(data.cards, data.now) : []), [data]);
  const recall = useMemo(
    () => (data ? recallIfStopped(data.cards, data.now, retrievability) : null),
    [data, retrievability],
  );
  if (!data || !today) return <div data-testid="coming-up-panel" data-loaded={false} />;
  if (recall === null) {
    return (
      <div className={styles.block} data-testid="coming-up-panel" data-loaded>
        <p className={styles.muted}>
          Your upcoming reviews will show here after your first session.
        </p>
      </div>
    );
  }
  const dayName = (date: LocalDate) => {
    const ahead = daysBetween(today, date);
    if (ahead === 0) return 'Today';
    if (ahead === 1) return 'Tmrw';
    return WEEKDAYS[dayOfWeek(date)] ?? date;
  };
  const total = days.reduce((sum, d) => sum + d.due, 0);
  const dueToday = days[0]?.due ?? 0;
  const { recallHorizonDays } = ENGINE_CONFIG.history;
  return (
    <div className={styles.block} data-testid="coming-up-panel" data-loaded>
      <div className={styles.block}>
        <p className={styles.headline} data-testid="coming-up-headline">
          {dueToday} due today · {total} this week
        </p>
        <TimeChart
          kind="bar"
          testId="due-chart"
          label="Reviews due each day this week"
          summary={`${dueToday} due today, ${total} over the next ${days.length} days.`}
          dates={days.map((d) => d.date)}
          series={[
            {
              id: 'due',
              label: 'Reviews due',
              colour: 'var(--tone)',
              values: days.map((d) => d.due),
            },
          ]}
          format={(v) => String(Math.round(v))}
          formatDate={dayName}
          integer
        />
      </div>
      <p className={styles.note} data-testid="recall-if-stopped">
        If you stopped practising today, you’d still recall about {Math.round(recall * 100)}% of
        what you’ve practised {recallHorizonDays} days from now. Each review spaces the next one
        further out, so it fades less each time.
      </p>
    </div>
  );
}
