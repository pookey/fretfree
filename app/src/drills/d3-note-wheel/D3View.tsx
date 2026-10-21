import { useEffect } from 'react';
import { Fretboard, type FretMarker } from '../../components/fretboard/Fretboard';
import type { GuideLevel } from '../../engine/model';
import { neckWindow } from '../../shell/size-class';
import type { Position } from '../../theory';
import { displayPc } from '../../theory/pitch-display';
import type { DrillRenderProps } from '../types';
import {
  d3AnswerPc,
  d3Explain,
  d3FeedbackPositions,
  d3KeyToAnswer,
  d3TapAnswer,
  d3WorkedExample,
  type D3Answer,
  type D3Prompt,
} from './logic';
import styles from './D3View.module.css';

/**
 * D3 view: the question and note buttons, and the step drawn on the low E
 * string (design §6 D3, §7 session). The note wheel is the drill's context
 * panel (`ContextPanel.tsx`), placed here beside the prompt.
 * The neck is an answer surface too: tapping the note on any string answers,
 * since finding it on the neck is the skill (research/02, target context).
 */
export function D3View({
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
}: DrillRenderProps<D3Prompt, D3Answer>) {
  const { pref, choices } = prompt;
  // Answers stay ASCII (`F#`); everything the learner reads says F♯.
  const from = displayPc(prompt.from);
  const target = displayPc(prompt.expectedPc);

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

  const tap = (pos: Position) => {
    if (feedback) return;
    onAnswer(d3TapAnswer(pos, tuning, pref));
  };

  const focus = Math.max(prompt.fromPosition.fret, prompt.expectedPosition.fret);
  const range = neckWindow(sizeClass, focus, compactFrets);

  const level: GuideLevel = guided ? 3 : guideLevel;
  const start: FretMarker = {
    ...prompt.fromPosition,
    style: 'root',
    label: from,
    forceLabel: true,
  };
  let markers: FretMarker[] = [start];
  const given = feedback ? d3AnswerPc(feedback.answer) : null;
  if (feedback) {
    const pos = d3FeedbackPositions(prompt, feedback, tuning, range);
    markers = [
      start,
      ...pos.expected.map((p): FretMarker => ({
        ...p,
        style: 'correct',
        label: target,
        forceLabel: true,
      })),
      ...pos.given.map((p): FretMarker => ({
        ...p,
        style: 'wrong',
        label: given === null ? undefined : displayPc(given),
        forceLabel: true,
      })),
    ];
  } else if (guided) {
    // Worked example: the first rep of a new item shows the answer.
    markers.push({
      ...prompt.expectedPosition,
      style: 'target',
      label: target,
      forceLabel: true,
    });
  }
  // While a recall prompt is open the neck must not name the answer: string
  // names and fret numbers (level ≥ 2) could spell it, so cap at inlays only.
  const neckLevel: GuideLevel = feedback || guided ? level : (Math.min(level, 1) as GuideLevel);

  return (
    <div className={styles.drill} data-size-class={sizeClass}>
      <div className={styles.upper}>
        <div className={styles.top}>
          <p className={styles.prompt} id="drill-prompt">
            {guided ? (
              <>
                {d3WorkedExample(prompt)} Tap <strong>{target}</strong> to continue.
              </>
            ) : (
              prompt.question
            )}
          </p>
          {/* One slot: the input hint while open, then the explanation (D6's pattern). */}
          <p
            className={styles.hint}
            data-testid="d3-hint"
            data-explaining={feedback ? true : undefined}
          >
            {feedback
              ? d3Explain(prompt, feedback)
              : 'Tap the note on any string of the neck, or press a button.'}
          </p>
          <div className={styles.choices} role="group" aria-labelledby="drill-prompt">
            {choices.map((c, i) => {
              const state = !feedback
                ? undefined
                : c === given
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
                  {displayPc(c)}
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
          handedness={handedness}
          markers={markers}
          guideLevel={neckLevel}
          accidentalPref={pref}
          onTapCell={tap}
          label={`Fretboard, ${from} marked on string ${prompt.fromPosition.string}. Tap the answer on any string.`}
        />
      </div>
      {/* iPad portrait: the context panel sits below the neck; compact styles it as a sheet. */}
      {sizeClass !== 'regular-wide' && aside}
    </div>
  );
}
