import type { GuideLevel } from '../../engine/model';
import { BOX_NUMBERS, boxShape } from '../../theory';
import type { DrillContextPanelProps } from '../types';
import { dpbDisplay, dpbShowsHint, type DpbAnswer, type DpbPrompt } from './logic';
import styles from './ContextPanel.module.css';

/**
 * The pentatonic-box drill's context panel (design §7): the five boxes in
 * chain order with the asked box marked. Which CAGED shape each box wraps
 * shows once the hint does (guide level 2, rule 9) or once answered; the
 * relative box's number only once answered, since it is part of what a
 * relative card teaches (rule 4). At full guides it says how the boxes chain,
 * against "box prison" (research/03 C7).
 */
export function BoxChainPanel({
  prompt,
  guideLevel,
  guided,
  feedback,
}: DrillContextPanelProps<DpbPrompt, DpbAnswer>) {
  // The worked example shows full guides (design §3.3 step 2).
  const level: GuideLevel = guided ? 3 : guideLevel;
  const answered = Boolean(feedback) || guided;
  const showShapes = answered || dpbShowsHint(guideLevel, guided);
  const chord = dpbDisplay(prompt.chord);
  const rel = `${dpbDisplay(prompt.relative.root)} ${prompt.relative.quality}`;
  return (
    <div className={styles.panel}>
      <h2>{chord} pentatonic boxes</h2>
      <table className={styles.chain}>
        <tbody>
          <tr>
            <th scope="row">Box</th>
            {BOX_NUMBERS.map((b) => (
              <td key={b} aria-current={b === prompt.box ? 'true' : undefined}>
                {b}
              </td>
            ))}
          </tr>
          {showShapes && (
            <tr>
              <th scope="row">Shape</th>
              {BOX_NUMBERS.map((b) => (
                <td key={b} aria-current={b === prompt.box ? 'true' : undefined}>
                  {boxShape(b)}
                </td>
              ))}
            </tr>
          )}
        </tbody>
      </table>
      {answered && prompt.mode === 'relative' && (
        <p data-testid="dpb-relative">
          {chord} box {prompt.box} is {rel} box {prompt.relative.box}: the same notes at the same
          frets.
        </p>
      )}
      {level >= 3 && (
        <p>Each box joins the next one up the neck. After box 5 the chain starts again at box 1.</p>
      )}
    </div>
  );
}
