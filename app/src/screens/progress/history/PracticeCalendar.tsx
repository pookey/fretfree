import { useMemo } from 'react';
import { toLocalDate } from '../../../engine/gamification/local-date';
import { practiceCalendar, type CalendarDay } from '../../../engine/history';
import { shortDate } from '../../../components/charts/scale';
import type { PanelProps } from '../registry';
import { useHistoryData } from './load';
import styles from './History.module.css';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** 0 = none, 1 = under half the goal, 2 = under the goal, 3 = goal met. */
function level(day: CalendarDay, goalMinutes: number): number {
  if (day.goalMet) return 3;
  if (day.minutes <= 0) return 0;
  return day.minutes < goalMinutes / 2 ? 1 : 2;
}

function describe(day: CalendarDay): string {
  if (day.future) return `${shortDate(day.date)}: still to come`;
  const parts = [day.minutes > 0 ? `${Math.round(day.minutes)} min` : 'no practice'];
  if (day.goalMet) parts.push('goal met');
  if (day.freezeUsed) parts.push('streak freeze used');
  return `${shortDate(day.date)}: ${parts.join(', ')}`;
}

/**
 * Session history as a calendar (design §7 Progress, §3.7): minutes shaded
 * by the daily goal, goal days marked ✓ and freeze days ❄, so no state is
 * shown by colour alone.
 */
export default function PracticeCalendar({ revision }: PanelProps) {
  const data = useHistoryData(revision);
  const today = data ? toLocalDate(data.now) : null;
  const weeks = useMemo(
    () => (data && today ? practiceCalendar(data.days, today) : []),
    [data, today],
  );
  if (!data) return <div data-testid="calendar-panel" data-loaded={false} />;
  const past = weeks.flat().filter((d) => !d.future);
  const lastSeven = past.slice(-7);
  const practisedDays = lastSeven.filter((d) => d.minutes > 0).length;
  const weekMinutes = Math.round((weeks.at(-1) ?? []).reduce((sum, d) => sum + d.minutes, 0));
  return (
    <div className={styles.block} data-testid="calendar-panel" data-loaded>
      <p className={styles.headline} data-testid="calendar-headline">
        Practised {practisedDays} of the last 7 days · {weekMinutes} min this week
      </p>
      <table className={styles.calendar}>
        <caption className={styles.hidden}>Practice by day, a week per row</caption>
        <thead>
          <tr>
            {WEEKDAYS.map((d) => (
              <th key={d} scope="col">
                <abbr title={d}>{d.slice(0, 1)}</abbr>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week) => (
            <tr key={week[0]?.date}>
              {week.map((day) => (
                <td key={day.date}>
                  <span
                    className={styles.day}
                    data-level={day.future ? undefined : level(day, data.dailyGoalMinutes)}
                    data-future={day.future || undefined}
                    data-freeze={day.freezeUsed || undefined}
                    data-today={day.date === today || undefined}
                    title={describe(day)}
                    data-testid={`calendar-${day.date}`}
                  >
                    <span aria-hidden>{day.goalMet ? '✓' : day.freezeUsed ? '❄' : ''}</span>
                    <span className={styles.hidden}>{describe(day)}</span>
                  </span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <ul className={styles.calendarLegend}>
        <li>
          <span className={styles.day} data-level={1} aria-hidden />
          Some practice
        </li>
        <li>
          <span className={styles.day} data-level={2} aria-hidden />
          Half the goal or more
        </li>
        <li>
          <span className={styles.day} data-level={3} aria-hidden>
            ✓
          </span>
          Goal met
        </li>
        <li>
          <span className={styles.day} data-level={0} data-freeze aria-hidden>
            ❄
          </span>
          Freeze used
        </li>
      </ul>
    </div>
  );
}
