import { useEffect } from 'react';
import { Fretboard, type FretMarker } from '../../components/fretboard/Fretboard';
import type { GuideLevel } from '../../engine/model';
import { neckWindow } from '../../shell/size-class';
import type { DrillRenderProps } from '../types';
import {
  D5_FRETS,
  d5ChoiceLabel,
  d5Explain,
  d5FeedbackPositions,
  d5KeyFor,
  d5KeyToAnswer,
  d5LineLegend,
  d5WorkedExample,
  type D5Answer,
  type D5Prompt,
} from './logic';
import styles from './D5View.module.css';

/**
 * D5 view: two dots on the neck (the root as a square, the upper note as a
 * circle) and interval buttons above (design §6 D5, §7 session). The
 * interval legend is the drill's context panel (`ContextPanel.tsx`).
 */
export function D5View({
  prompt,
  guideLevel,
  guided,
  handedness,
  sizeClass,
  compactFrets,
  tuning,
  feedback,
  onAnswer,
  aside,
  blindMode = false,
}: DrillRenderProps<D5Prompt, D5Answer>) {
  const { choices } = prompt;

  useEffect(() => {
    if (feedback) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const answer = d5KeyToAnswer(e.key, choices);
      if (answer) {
        e.preventDefault();
        onAnswer(answer);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [feedback, onAnswer, choices]);

  // Centre the compact window between the dots: C3 shapes span at most four
  // frets, so both fit even the narrowest (five-fret) window.
  const mid = Math.floor((prompt.root.fret + prompt.upper.fret) / 2);
  const range = neckWindow(sizeClass, mid, compactFrets);
  // The worked example shows full guides (design §3.3 step 2).
  const level: GuideLevel = guided ? 3 : guideLevel;

  const root: FretMarker = { ...prompt.root, style: 'root', label: prompt.rootPc };
  let markers: FretMarker[];
  if (feedback) {
    const pos = d5FeedbackPositions(prompt, feedback, tuning);
    markers = [
      { ...root, forceLabel: true },
      ...pos.expected.map((p): FretMarker => ({
        ...p,
        style: 'correct',
        label: prompt.interval,
        forceLabel: true,
      })),
      ...pos.given.map((p): FretMarker => ({
        ...p,
        style: 'wrong',
        label: feedback.answer,
        forceLabel: true,
      })),
    ];
  } else if (guided) {
    // Worked example: the first rep of a new item names the interval.
    markers = [
      { ...root, forceLabel: true },
      { ...prompt.upper, style: 'target', label: prompt.interval, forceLabel: true },
    ];
  } else {
    // A recall prompt: the upper dot is a target, so no guide level labels it.
    markers = [root, { ...prompt.upper, style: 'target' }];
  }

  return (
    <div
      className={styles.drill}
      data-size-class={sizeClass}
      data-wide={d5LineLegend(choices.length) || undefined}
      data-testid="d5-drill"
    >
      <div className={styles.upper}>
        <div className={styles.top}>
          <p className={styles.prompt} id="drill-prompt">
            {guided ? (
              <>
                {d5WorkedExample(prompt)} Tap <strong>{prompt.interval}</strong> to continue.
              </>
            ) : (
              'Name the interval'
            )}
          </p>
          {feedback ? (
            // Feedback teaches the count, at every guide level (rule 9).
            <p className={styles.hint} data-testid="d5-explain">
              {d5Explain(prompt, feedback)}
            </p>
          ) : (
            <p className={styles.hint} data-testid="d5-hint">
              {/* A guide like the others: gone at level 0, the independent stage (rule 9). */}
              {level >= 1 && 'From the square (the lower note) up to the round dot.'}
            </p>
          )}
          <div className={styles.choices} role="group" aria-labelledby="drill-prompt">
            {choices.map((c, i) => {
              const state = !feedback
                ? undefined
                : c === feedback.answer
                  ? feedback.result.correct
                    ? 'correct'
                    : 'wrong'
                  : c === prompt.interval && !feedback.result.correct
                    ? 'expected'
                    : undefined;
              return (
                <button
                  key={c}
                  type="button"
                  className={styles.choice}
                  data-state={state}
                  disabled={Boolean(feedback)}
                  onClick={() => onAnswer(c)}
                  aria-label={d5ChoiceLabel(c)}
                  aria-keyshortcuts={d5KeyFor(i)}
                >
                  {c}
                </button>
              );
            })}
          </div>
        </div>
        {sizeClass === 'regular-wide' && aside}
      </div>
      <div className={styles.neckArea}>
        <Fretboard
          tuning={tuning}
          fretRange={range}
          activeRange={{ from: 0, to: D5_FRETS.to }}
          handedness={handedness}
          markers={markers}
          guideLevel={level}
          blindMode={blindMode}
          accidentalPref={prompt.pref}
          label={`Fretboard, root on string ${prompt.root.string} fret ${prompt.root.fret}, second note on string ${prompt.upper.string} fret ${prompt.upper.fret}`}
        />
      </div>
      {/* iPad portrait: below the neck. Compact: the session styles it as a sheet. */}
      {sizeClass !== 'regular-wide' && aside}
    </div>
  );
}
