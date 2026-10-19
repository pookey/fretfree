import type { CSSProperties } from 'react';
import type { GuideLevel } from '../../engine/model';
import type { IntervalName } from '../../theory';
import { d5LegendRows, d5LegendTips, d5LineLegend } from './logic';
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

/** One-line rows run down this many columns. */
const LINE_COLUMNS = 3;

/** The interval legend for the context panel, faded with the guide level (design §7). */
export function IntervalLegend({ choices, guideLevel, gbShift, expected, given }: Props) {
  const rows = d5LegendRows(choices, guideLevel);
  const tips = d5LegendTips(guideLevel, gbShift, choices.length);
  // A wide scope packs each row onto one line (`M3 major 3rd · 4`), read down
  // the columns, so the panel stays short enough for the neck below it.
  const lines = d5LineLegend(choices.length);
  return (
    <>
      <ul
        className={lines ? `${styles.legend} ${styles.lines}` : styles.legend}
        style={
          lines ? ({ '--rows': Math.ceil(rows.length / LINE_COLUMNS) } as CSSProperties) : undefined
        }
        data-testid="interval-legend"
        data-level={guideLevel}
        data-layout={lines ? 'lines' : 'stacked'}
      >
        {rows.map((r) => {
          const steps =
            r.semitones === undefined
              ? null
              : `${r.semitones} half step${r.semitones === 1 ? '' : 's'}`;
          return (
            <li
              key={r.name}
              data-interval={r.name}
              data-state={r.name === expected ? 'expected' : r.name === given ? 'wrong' : undefined}
            >
              <strong>{r.name}</strong>
              <span>{r.long}</span>
              {steps &&
                (lines ? (
                  // "half steps" stays for screen readers; the dot is only visual.
                  <span className={styles.steps}>
                    <span aria-hidden="true">· </span>
                    {r.semitones}
                    <span className="visually-hidden">
                      {' '}
                      half step{r.semitones === 1 ? '' : 's'}
                    </span>
                  </span>
                ) : (
                  <span className={styles.steps}>{steps}</span>
                ))}
            </li>
          );
        })}
      </ul>
      {tips.map((t) => (
        <p key={t}>{t}</p>
      ))}
    </>
  );
}
