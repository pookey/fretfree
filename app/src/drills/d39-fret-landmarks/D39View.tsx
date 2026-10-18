import { useEffect, useState } from 'react';
import { Fretboard, type FretMarker } from '../../components/fretboard/Fretboard';
import type { GuideLevel } from '../../engine/model';
import { noteAt, type Position } from '../../theory';
import type { DrillRenderProps } from '../types';
import {
  d39ChoiceLabel,
  d39Column,
  d39FeedbackPositions,
  d39FeedbackRange,
  d39NeckGuideLevel,
  d39Question,
  d39TypeKey,
  d39WorkedExample,
  type D39Answer,
  type D39Prompt,
} from './logic';
import styles from './D39View.module.css';

/**
 * D39 view (design §6 D39): the question and fret buttons, the neck below.
 * A spotlit fret is the one every other fret is dimmed around. Markers are
 * found by tapping the neck; everything else is answered with a button or by
 * typing the fret number.
 */
export function D39View({
  prompt,
  guideLevel,
  guided,
  handedness,
  sizeClass,
  tuning,
  feedback,
  onAnswer,
  aside,
  blindMode = false,
}: DrillRenderProps<D39Prompt, D39Answer>) {
  // What has been typed so far, kept with its prompt so a new prompt starts empty.
  const [entry, setEntry] = useState({ itemId: prompt.itemId, typed: '' });
  const typed = entry.itemId === prompt.itemId ? entry.typed : '';
  const { choices, mode } = prompt;

  useEffect(() => {
    if (feedback || choices.length === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // Enter on a focused button presses it; only typed numbers are ours.
      if (e.key === 'Enter' && typed === '') return;
      const next = d39TypeKey(typed, e.key, choices);
      if (next.typed === typed && next.answer === null) return;
      e.preventDefault();
      setEntry({ itemId: prompt.itemId, typed: next.typed });
      if (next.answer !== null) onAnswer(next.answer);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [feedback, onAnswer, choices, typed, prompt.itemId]);

  const tap = (pos: Position) => {
    if (feedback || mode !== 'find-marker') return;
    onAnswer(pos.fret);
  };

  const level: GuideLevel = guided ? 3 : guideLevel;
  const neckLevel = d39NeckGuideLevel(prompt, guideLevel, {
    guided,
    answered: Boolean(feedback),
  });
  const range = feedback ? d39FeedbackRange(prompt, feedback.answer) : prompt.range;
  const pc = (p: Position) => noteAt(p, tuning, prompt.accidentalPref).pc;
  // The fret whose column stays lit while the rest of the neck is dimmed.
  const spotlight = feedback
    ? mode === 'repeat'
      ? undefined
      : prompt.expected
    : mode === 'name-marker' || (mode === 'find-marker' && guided)
      ? prompt.from
      : undefined;

  const markers: FretMarker[] = [];
  const topString = 1;
  if (mode === 'repeat') {
    // The starting fret's notes; the open strings are already named at the nut.
    if (prompt.from > 0) {
      markers.push(
        ...d39Column(tuning, prompt.from).map((p): FretMarker => ({
          ...p,
          style: 'root',
          label: pc(p),
          forceLabel: Boolean(feedback) || guided,
        })),
      );
    }
  }
  if (feedback) {
    const pos = d39FeedbackPositions(prompt, feedback, tuning);
    if (mode === 'repeat') {
      markers.push(
        ...pos.expected.map((p): FretMarker => ({
          ...p,
          style: 'correct',
          label: pc(p),
          forceLabel: true,
        })),
      );
    } else {
      markers.push({
        string: topString,
        fret: prompt.expected,
        style: 'correct',
        label: String(prompt.expected),
        forceLabel: true,
      });
    }
    if (!feedback.result.correct) {
      markers.push({
        string: topString,
        fret: feedback.answer,
        style: 'wrong',
        label: String(feedback.answer),
        forceLabel: true,
      });
    }
  } else if (guided && mode !== 'repeat') {
    markers.push({
      string: topString,
      fret: prompt.expected,
      style: 'target',
      label: String(prompt.expected),
      forceLabel: true,
    });
  }

  const question = d39Question(prompt);
  const context = aside ? (
    <aside className={styles.context} aria-label="Context" data-testid="context-panel">
      <h2>Fret markers</h2>
      <p>
        Single dots at <strong>3, 5, 7 and 9</strong>. A double dot at <strong>12</strong>.
      </p>
      {level >= 2 && (
        <p>
          At the 12th fret every string sounds its open note an octave up, and the pattern starts
          again: each fret repeats 12 frets higher.
        </p>
      )}
    </aside>
  ) : null;

  const neckLabel =
    mode === 'find-marker'
      ? 'Fretboard. Tap a fret.'
      : mode === 'name-marker'
        ? 'Fretboard, one marker spotlit'
        : prompt.from === 0
          ? 'Fretboard, the open strings marked'
          : `Fretboard, fret ${prompt.from} marked`;

  return (
    <div className={styles.drill} data-size-class={sizeClass}>
      <div className={styles.upper}>
        <div className={styles.top}>
          <p className={styles.prompt} id="drill-prompt">
            {guided ? (
              <>
                {d39WorkedExample(prompt)}{' '}
                {mode === 'find-marker' ? (
                  'Tap it to continue.'
                ) : (
                  <>
                    Tap <strong>{d39ChoiceLabel(prompt.expected)}</strong> to continue.
                  </>
                )}
              </>
            ) : (
              question
            )}
          </p>
          <p className={styles.hint} data-testid="d39-hint" aria-live="polite">
            {!feedback &&
              (mode === 'find-marker'
                ? 'Tap anywhere on that fret.'
                : typed
                  ? `Typed ${typed}. Press Enter to answer.`
                  : '')}
          </p>
          {choices.length > 0 && (
            <div className={styles.choices} role="group" aria-labelledby="drill-prompt">
              {choices.map((c) => {
                const state = !feedback
                  ? undefined
                  : c === feedback.answer
                    ? feedback.result.correct
                      ? 'correct'
                      : 'wrong'
                    : c === prompt.expected && !feedback.result.correct
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
                    aria-label={c === 0 ? 'Open string' : `Fret ${c}`}
                  >
                    {d39ChoiceLabel(c)}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        {sizeClass === 'regular-wide' && context}
      </div>
      <div
        className={styles.neckArea}
        data-testid="d39-neck"
        data-mode={mode}
        data-spotlight={spotlight}
      >
        <Fretboard
          tuning={tuning}
          fretRange={range}
          activeRange={spotlight === undefined ? undefined : { from: spotlight, to: spotlight }}
          handedness={handedness}
          markers={markers}
          guideLevel={neckLevel}
          blindMode={blindMode}
          accidentalPref={prompt.accidentalPref}
          onTapCell={mode === 'find-marker' && !feedback ? tap : undefined}
          label={neckLabel}
        />
      </div>
      {/* iPad portrait: the context panel sits below the neck; compact styles it as a sheet. */}
      {sizeClass !== 'regular-wide' && context}
    </div>
  );
}
