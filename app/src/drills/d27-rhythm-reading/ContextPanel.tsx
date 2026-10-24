import { ENGINE_CONFIG } from '../../engine/config';
import type { GuideLevel } from '../../engine/model';
import { countSyllables, rhythmCell } from '../../theory';
import type { DrillContextPanelProps } from '../types';
import { d27Difference, signatureOf, type D27Answer, type D27Prompt } from './logic';
import styles from './ContextPanel.module.css';

/**
 * D27's context panel (design §7): the cell being read, how it is counted,
 * and what tells it from the look-alike it is written beside. The counting
 * fades with the guides (rule 9); the session hides the whole panel at guide
 * level 0.
 */
export function ReadingPanel({
  prompt,
  guideLevel,
  guided,
}: DrillContextPanelProps<D27Prompt, D27Answer>) {
  const level: GuideLevel = guided ? 3 : guideLevel;
  const cell = rhythmCell(prompt.cell);
  const count = countSyllables(cell.rhythm, signatureOf(prompt.meter))
    .map((s, i) => (cell.rhythm[i]?.rest ? `(${s || '–'})` : s || '·'))
    .join(' ');
  return (
    <div className={styles.panel}>
      <h2>{cell.name}</h2>
      {level >= ENGINE_CONFIG.rhythmReading.countGuideLevel && (
        <p data-testid="d27-cell-count">
          Count it “{count}”. The numbers are the beats; say the count under your breath as you tap.
        </p>
      )}
      {prompt.partner && (
        <p data-testid="d27-partner">
          Don’t mistake it for {rhythmCell(prompt.partner).name.toLowerCase()}.{' '}
          {d27Difference(prompt.cell, prompt.partner)}
        </p>
      )}
      <p>
        A bar of beats counts you in. Then play the bar {prompt.bars} times through, at {prompt.bpm}{' '}
        clicks a minute.
      </p>
    </div>
  );
}
