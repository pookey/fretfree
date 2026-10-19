import type { GuideLevel } from '../../engine/model';
import type { IntervalName } from '../../theory';
import { d5LegendRows, d5LegendTips } from './logic';
import styles from './ContextPanel.module.css';

interface Props {
  choices: readonly IntervalName[];
  guideLevel: GuideLevel;
  /** The shape crosses the G–B pair: level 3 explains the shifted fret. */
  gbShift: boolean;
  /** Set in feedback: the right answer, and the wrong one if the learner missed. */
  expected?: IntervalName;
  given?: IntervalName;
}

/** The interval legend for the context panel, faded with the guide level (design §7). */
export function IntervalLegend({ choices, guideLevel, gbShift, expected, given }: Props) {
  const rows = d5LegendRows(choices, guideLevel);
  const tips = d5LegendTips(guideLevel, gbShift);
  return (
    <>
      <ul className={styles.legend} data-testid="interval-legend" data-level={guideLevel}>
        {rows.map((r) => (
          <li
            key={r.name}
            data-interval={r.name}
            data-state={r.name === expected ? 'expected' : r.name === given ? 'wrong' : undefined}
          >
            <strong>{r.name}</strong>
            <span>{r.long}</span>
            {r.semitones !== undefined && (
              <span className={styles.steps}>
                {r.semitones} half step{r.semitones === 1 ? '' : 's'}
              </span>
            )}
          </li>
        ))}
      </ul>
      {tips.map((t) => (
        <p key={t}>{t}</p>
      ))}
    </>
  );
}
