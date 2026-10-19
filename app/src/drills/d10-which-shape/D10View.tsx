import { useEffect } from 'react';
import { Fretboard, type FretMarker } from '../../components/fretboard/Fretboard';
import type { GuideLevel } from '../../engine/model';
import { COMPACT_WINDOW_FRETS } from '../../shell/size-class';
import { samePosition, type ShapeNote } from '../../theory';
import type { DrillRenderProps } from '../types';
import {
  d10DegreeStyle,
  d10Display,
  d10Explain,
  d10KeyToAnswer,
  d10ShowsDegrees,
  d10Window,
  type D10Answer,
  type D10Prompt,
} from './logic';
import styles from './D10View.module.css';

/**
 * D10 view (design §6 D10, §7). A CAGED shape is drawn on the neck, its roots
 * as squares, and the learner picks a shape from the buttons above: which
 * shape it is, or which comes next along the chain. The iPad shows the whole
 * neck, so the shape sits in context; feedback draws the answer shape by
 * degree, beside the shown neighbour for a chain question.
 */
export function D10View({
  prompt,
  guideLevel,
  guided,
  handedness,
  sizeClass,
  compactFrets = COMPACT_WINDOW_FRETS,
  tuning,
  feedback,
  onAnswer,
  aside,
  blindMode = false,
}: DrillRenderProps<D10Prompt, D10Answer>) {
  const { choices } = prompt;

  useEffect(() => {
    if (feedback) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const answer = d10KeyToAnswer(e.key, choices);
      if (answer) {
        e.preventDefault();
        onAnswer(answer);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [feedback, onAnswer, choices]);

  // The worked example shows full guides (design §3.3 step 2).
  const level: GuideLevel = guided ? 3 : guideLevel;
  const degrees = d10ShowsDegrees(guideLevel, guided);
  const root = d10Display(prompt.root);
  const naming = prompt.ask === 'name';

  const byDegree = (n: ShapeNote): FretMarker => ({
    string: n.string,
    fret: n.fret,
    style: d10DegreeStyle(n.degree),
    label: n.degree === 'R' ? root : d10Display(n.degree),
    forceLabel: true,
  });
  /** A recall prompt: roots are squares, the rest plain dots; degrees only while guides are up. */
  const plain = (n: ShapeNote): FretMarker =>
    degrees
      ? byDegree(n)
      : n.degree === 'R'
        ? { string: n.string, fret: n.fret, style: 'root', label: root }
        : { string: n.string, fret: n.fret, style: 'tone' };

  let markers: FretMarker[];
  if (feedback || (guided && !naming)) {
    // The answer shape by degree; a chain question keeps its neighbour as rings.
    const answer = prompt.answer.notes;
    markers = [
      ...prompt.shown.notes
        .filter((n) => !answer.some((a) => samePosition(a, n)))
        .map((n): FretMarker => ({ string: n.string, fret: n.fret, style: 'ghost' })),
      ...answer.map(byDegree),
    ];
  } else {
    markers = prompt.shown.notes.map(plain);
  }

  const chord = <strong>{d10Display(prompt.chord)}</strong>;
  const answer = <strong>{prompt.shape}</strong>;
  const shown = prompt.shown.shape;
  let question;
  if (guided) {
    const lead =
      prompt.ask === 'name' ? (
        <>
          This is the {prompt.shape} shape of {chord}.
        </>
      ) : prompt.ask === 'next' ? (
        <>
          After the {shown} shape of {chord} comes the {prompt.shape} shape.
        </>
      ) : (
        <>
          Before the {shown} shape of {chord} comes the {prompt.shape} shape.
        </>
      );
    question = (
      <>
        {lead} Tap {answer} to continue.
      </>
    );
  } else if (prompt.ask === 'name') {
    question = <>Which CAGED shape is this {chord} chord?</>;
  } else if (prompt.ask === 'next') {
    question = (
      <>
        This is the {shown} shape of {chord}. Which shape comes next, up the neck?
      </>
    );
  } else {
    question = (
      <>
        This is the {shown} shape of {chord}. Which shape comes before it, down the neck?
      </>
    );
  }

  let hint = '';
  if (feedback) hint = d10Explain(prompt, feedback);
  // A guide like the others: gone at level 0, the independent stage (rule 9).
  else if (level >= 1) {
    hint =
      prompt.ask === 'previous'
        ? 'Down the neck is toward the nut. The squares are the roots.'
        : prompt.ask === 'next'
          ? 'Up the neck is toward the body. The squares are the roots.'
          : `The squares are the roots, ${root}.`;
  }

  return (
    <div
      className={styles.drill}
      data-testid="d10-drill"
      data-size-class={sizeClass}
      data-ask={prompt.ask}
      data-level={prompt.level}
    >
      <div className={styles.upper}>
        <div className={styles.top}>
          <p className={styles.prompt} id="drill-prompt" data-testid="d10-prompt">
            {question}
          </p>
          <p className={styles.hint} data-testid="d10-explain">
            {hint}
          </p>
          <div className={styles.choices} role="group" aria-labelledby="drill-prompt">
            {choices.map((c) => {
              const state = !feedback
                ? undefined
                : c === feedback.answer
                  ? feedback.result.correct
                    ? 'correct'
                    : 'wrong'
                  : c === prompt.shape && !feedback.result.correct
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
                  aria-label={`${c} shape`}
                  aria-keyshortcuts={c}
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
          fretRange={d10Window(prompt, sizeClass, compactFrets)}
          activeRange={prompt.activeRange}
          handedness={handedness}
          markers={markers}
          guideLevel={level}
          blindMode={blindMode}
          accidentalPref={prompt.accidentalPref}
          label={`Fretboard: a shape of ${d10Display(prompt.chord)}`}
        />
      </div>
      {/* Below the neck on iPad portrait; the session shows it as a sheet on compact. */}
      {sizeClass !== 'regular-wide' && aside}
    </div>
  );
}
