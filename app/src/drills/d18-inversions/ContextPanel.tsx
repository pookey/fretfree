import { ENGINE_CONFIG } from '../../engine/config';
import type { GuideLevel } from '../../engine/model';
import type { DrillContextPanelProps } from '../types';
import {
  D18_INVERSIONS,
  d18Display,
  d18Formula,
  d18InversionName,
  d18StringSpan,
  type D18Answer,
  type D18Prompt,
} from './logic';
import styles from './ContextPanel.module.css';

/** "the A shape", "the C and D shapes". */
function shapesLine(shapes: readonly string[]): string {
  if (shapes.length === 1) return `the ${shapes[0]} shape`;
  return `the ${shapes.slice(0, -1).join(', ')} and ${shapes.at(-1)} shapes`;
}

/**
 * D18's context panel (design §7). It lists the three inversions on the
 * string set, each with its degrees from the low string from guide level 2
 * (rule 9: the formula fades with the guides). A build card marks the asked
 * inversion, which its prompt names; a name card marks it only once
 * answered, since it is the answer (rule 4). After an answer it names the
 * CAGED shape the triad sits in (research/03: triads are the shapes' cores).
 */
export function InversionsPanel({
  prompt,
  guideLevel,
  guided,
  feedback,
}: DrillContextPanelProps<D18Prompt, D18Answer>) {
  // The worked example shows full guides (design §3.3 step 2).
  const level: GuideLevel = guided ? 3 : guideLevel;
  const answered = Boolean(feedback) || guided;
  const formulas = answered || level >= ENGINE_CONFIG.triadInversions.formulaGuideLevel;
  const marked = answered || prompt.mode === 'build';
  return (
    <div className={styles.panel}>
      <h2>Inversions on {d18StringSpan(prompt.lowString)}</h2>
      <ol className={styles.inversions} aria-label="Inversions">
        {D18_INVERSIONS.map((inv) => (
          <li key={inv} aria-current={marked && inv === prompt.inversion ? 'true' : undefined}>
            <span>{d18InversionName(inv)}</span>
            {formulas && <span className={styles.formula}>{d18Formula(prompt.quality, inv)}</span>}
          </li>
        ))}
      </ol>
      {answered && prompt.cores.length > 0 ? (
        <p data-testid="d18-core">
          This triad sits inside {shapesLine(prompt.cores)} of {d18Display(prompt.chord)}.
        </p>
      ) : (
        level >= 3 && (
          <p>
            Each inversion moves the lowest note up to the next chord tone: root, then 3rd, then
            5th.
          </p>
        )
      )}
    </div>
  );
}
