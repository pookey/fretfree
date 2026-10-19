import type { GuideLevel } from '../../engine/model';
import { LazyCagedChainMap } from '../../session/context/parts';
import { CAGED_ORDER, STANDARD_TUNING } from '../../theory';
import type { DrillContextPanelProps } from '../types';
import { d9Display, type D9Answer, type D9Prompt } from './logic';
import styles from './ContextPanel.module.css';

/**
 * D9's context panel (design §7 "the CAGED chain mini-map"). Before an answer
 * it shows only the chain's order, C A G E D, with the asked shape marked:
 * where the shape sits on the neck is the answer (research/02 rule 4). Once
 * the shape is built, or in a worked example, the mini-map places it among
 * its neighbours from guide level 2 (rule 9: less at lower levels). The
 * mini-map reuses the Explore visualiser and loads on first use.
 *
 * D10 asks which shape comes next, so the mini-map belongs to D9 only: a
 * drill's panel is its own, and D10 must not borrow this one.
 */
export function CagedChainPanel({
  prompt,
  guideLevel,
  guided,
  handedness,
  tuning,
  feedback,
}: DrillContextPanelProps<D9Prompt, D9Answer>) {
  // The worked example shows full guides (design §3.3 step 2).
  const level: GuideLevel = guided ? 3 : guideLevel;
  const answered = Boolean(feedback) || guided;
  const showMap = answered && level >= 2;
  return (
    <div className={styles.panel}>
      <h2>CAGED chain</h2>
      <ol className={styles.order} aria-label="CAGED order">
        {CAGED_ORDER.map((s) => (
          <li key={s} aria-current={s === prompt.shape ? 'true' : undefined}>
            {s}
          </li>
        ))}
      </ol>
      {showMap ? (
        <>
          <LazyCagedChainMap
            root={prompt.root}
            quality={prompt.quality}
            current={prompt.shape}
            accidentalPref={prompt.accidentalPref}
            handedness={handedness}
            fallback={<div className={styles.mapSlot} />}
          />
          <p className={styles.caption}>
            The five shapes of {d9Display(prompt.chord)} up the neck
            {tuning.id !== STANDARD_TUNING.id && ', in standard tuning'}.
          </p>
        </>
      ) : (
        level >= 3 && (
          <p>Each shape joins the next one up the neck. After D, the chain starts again at C.</p>
        )
      )}
    </div>
  );
}
