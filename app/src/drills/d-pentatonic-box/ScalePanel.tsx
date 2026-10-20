import type { GuideLevel } from '../../engine/model';
import { BOX_NUMBERS, boxShape } from '../../theory';
import type { DrillContextPanelProps } from '../types';
import { dpbDisplay, dpbShowsHint } from './logic';
import { dpsDegreeLine, dpsDegreeName, type DpsAnswer, type DpsPrompt } from './scale';
import styles from './ContextPanel.module.css';

/**
 * The scale-position panel (design §7): the five positions in chain order
 * with the asked one marked, as the box panel does. Which CAGED shape each
 * surrounds shows once the hint does (guide level 2, rule 9) or once
 * answered. A run's degrees show only once answered: they are its answer
 * (rule 4). At full guides it says how a position grows from its box.
 */
export function ScalePositionPanel({
  prompt,
  guideLevel,
  guided,
  feedback,
}: DrillContextPanelProps<DpsPrompt, DpsAnswer>) {
  // The worked example shows full guides (design §3.3 step 2).
  const level: GuideLevel = guided ? 3 : guideLevel;
  const answered = Boolean(feedback) || guided;
  const showShapes = answered || dpbShowsHint(guideLevel, guided);
  return (
    <div className={styles.panel}>
      <h2>{dpbDisplay(prompt.tonic)} major positions</h2>
      <table className={styles.chain}>
        <tbody>
          <tr>
            <th scope="row">Position</th>
            {BOX_NUMBERS.map((p) => (
              <td key={p} aria-current={p === prompt.position ? 'true' : undefined}>
                {p}
              </td>
            ))}
          </tr>
          {showShapes && (
            <tr>
              <th scope="row">Shape</th>
              {BOX_NUMBERS.map((p) => (
                <td key={p} aria-current={p === prompt.position ? 'true' : undefined}>
                  {boxShape(p)}
                </td>
              ))}
            </tr>
          )}
        </tbody>
      </table>
      {answered && prompt.mode === 'run' && (
        <p data-testid="dps-run">
          From the {dpsDegreeName(prompt.degree)}: {dpsDegreeLine(prompt.targets)}
        </p>
      )}
      {level >= 3 && (
        <p>
          Each position is the major pentatonic box of the same number with the 4th and 7th added.
          The positions join up the neck as the boxes do.
        </p>
      )}
    </div>
  );
}
