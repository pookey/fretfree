import { useEffect } from 'react';
import { Fretboard, type FretMarker } from '../../components/fretboard/Fretboard';
import type { GuideLevel } from '../../engine/model';
import { neckWindow } from '../../shell/size-class';
import type { DrillRenderProps } from '../types';
import { NoteWheel } from './NoteWheel';
import {
  d3FeedbackPositions,
  d3KeyToAnswer,
  d3WorkedExample,
  type D3Answer,
  type D3Prompt,
} from './logic';
import styles from './D3View.module.css';

/**
 * D3 view: the question and note buttons, the note wheel in the context
 * panel, and the step drawn on the low E string (design §6 D3, §7 session).
 */
export function D3View({
  prompt,
  guideLevel,
  guided,
  handedness,
  sizeClass,
  tuning,
  feedback,
  onAnswer,
  aside,
}: DrillRenderProps<D3Prompt, D3Answer>) {
  const { pref, choices } = prompt;

  useEffect(() => {
    if (feedback) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const answer = d3KeyToAnswer(e.key, e.shiftKey, choices, pref);
      if (answer) {
        e.preventDefault();
        onAnswer(answer);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [feedback, onAnswer, pref, choices]);

  const level: GuideLevel = guided ? 3 : guideLevel;
  const start: FretMarker = {
    ...prompt.fromPosition,
    style: 'root',
    label: prompt.from,
    forceLabel: true,
  };
  let markers: FretMarker[] = [start];
  if (feedback) {
    const pos = d3FeedbackPositions(prompt, feedback);
    markers = [
      start,
      ...pos.expected.map((p): FretMarker => ({
        ...p,
        style: 'correct',
        label: prompt.expectedPc,
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
    // Worked example: the first rep of a new item shows the answer.
    markers.push({
      ...prompt.expectedPosition,
      style: 'target',
      label: prompt.expectedPc,
      forceLabel: true,
    });
  }
  // While a recall prompt is open the neck must not name the answer: string
  // names and fret numbers (level ≥ 2) could spell it, so cap at inlays only.
  const neckLevel: GuideLevel = feedback || guided ? level : (Math.min(level, 1) as GuideLevel);

  const focus = Math.max(prompt.fromPosition.fret, prompt.expectedPosition.fret);
  const range = neckWindow(sizeClass, focus);

  // The session hands over its context panel only when it should be shown
  // (help on, guide level > 0, not compact); D3 fills it with the note wheel.
  const context = aside ? (
    <aside className={styles.context} aria-label="Context" data-testid="context-panel">
      <h2>Note wheel</h2>
      <NoteWheel
        guideLevel={level}
        pref={pref}
        start={prompt.from}
        {...(feedback
          ? {
              expected: prompt.expectedPc,
              ...(feedback.result.correct ? {} : { given: feedback.answer }),
            }
          : {})}
      />
      {level >= 2 && (
        <p>
          No sharp between <strong>B–C</strong> and <strong>E–F</strong>: they are a half step
          apart. Every other pair of letters is a whole step.
        </p>
      )}
      {level >= 3 && <p>On one string, a half step is one fret and a whole step is two.</p>}
    </aside>
  ) : null;

  return (
    <div className={styles.drill} data-size-class={sizeClass}>
      <div className={styles.upper}>
        <div className={styles.top}>
          <p className={styles.prompt} id="drill-prompt">
            {guided ? (
              <>
                {d3WorkedExample(prompt)} Tap <strong>{prompt.expectedPc}</strong> to continue.
              </>
            ) : (
              prompt.question
            )}
          </p>
          <div className={styles.choices} role="group" aria-labelledby="drill-prompt">
            {choices.map((c, i) => {
              const state = !feedback
                ? undefined
                : c === feedback.answer
                  ? feedback.result.correct
                    ? 'correct'
                    : 'wrong'
                  : c === prompt.expectedPc && !feedback.result.correct
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
                  aria-keyshortcuts={i < 9 ? String(i + 1) : undefined}
                >
                  {c}
                </button>
              );
            })}
          </div>
        </div>
        {sizeClass === 'regular-wide' && context}
      </div>
      <div className={styles.neckArea}>
        <Fretboard
          tuning={tuning}
          fretRange={range}
          handedness={handedness}
          markers={markers}
          guideLevel={neckLevel}
          accidentalPref={pref}
          label={`Fretboard, ${prompt.from} marked on string ${prompt.fromPosition.string}`}
        />
      </div>
      {/* iPad portrait: the context panel sits below the neck. */}
      {sizeClass === 'regular' && context}
    </div>
  );
}
