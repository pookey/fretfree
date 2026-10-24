import { useEffect, useMemo } from 'react';
import { Fretboard, type FretMarker } from '../../components/fretboard/Fretboard';
import { Staff, type StaffNote } from '../../components/staff';
import { neckWindow } from '../../shell/size-class';
import { positionReach } from '../../theory';
import type { DrillRenderProps } from '../types';
import {
  d25NeckPositions,
  d25KeyToAnswer,
  d25KeysFor,
  pretty,
  type D25Answer,
  type D25Prompt,
} from './logic';
import { D25_TASK, d25Explain, d25Fact, d25StaffLabel, spoken } from './text';
import styles from './D25View.module.css';

/**
 * D25 view (design §6 D25, §12 Screens): the staff with its key signature
 * and one note, the question and the three spellings, and the neck below
 * (iPad landscape: staff above the neck, both in view). The neck shows the
 * reading position before the answer and the note's fret after it, beside
 * the chosen spelling's when wrong. Feedback marks buttons by border style
 * as well as colour, then explains.
 */
export function D25View({
  prompt,
  guided,
  guideLevel,
  handedness,
  sizeClass,
  compactFrets,
  tuning,
  feedback,
  onAnswer,
  aside,
  blindMode = false,
}: DrillRenderProps<D25Prompt, D25Answer>) {
  const { choices } = prompt;

  useEffect(() => {
    if (feedback) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const answer = d25KeyToAnswer(e.key, choices);
      if (answer) {
        e.preventDefault();
        onAnswer(answer);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [feedback, onAnswer, choices]);

  const style = !feedback ? 'target' : feedback.result.correct ? 'correct' : 'wrong';
  const notes = useMemo<StaffNote[]>(
    () => [{ pitches: [prompt.note], value: 'w', style }],
    [prompt.note, style],
  );

  // The worked example shows full guides (design §3.3 step 2).
  const level = guided ? 3 : guideLevel;
  const position = prompt.position;
  const range = neckWindow(sizeClass, position ? position.fret + 1 : 0, compactFrets);
  const answer = pretty(prompt.answer);

  // The neck shows the note's fret only once it is no longer a recall test.
  let markers: FretMarker[] = [];
  if (feedback || guided) {
    const given = feedback && !feedback.result.correct ? feedback.answer : null;
    const pos = d25NeckPositions(prompt, given, tuning);
    markers = [
      ...pos.expected.map((p): FretMarker => ({
        ...p,
        style: 'correct',
        label: answer,
        forceLabel: true,
      })),
      ...pos.given.map((p): FretMarker => ({
        ...p,
        style: 'wrong',
        label: pretty(given ?? ''),
        forceLabel: true,
      })),
    ];
  }

  const explanation = feedback ? d25Explain(prompt, feedback.answer) : null;

  return (
    <div className={styles.drill} data-size-class={sizeClass} data-testid="d25-drill">
      <div className={styles.upper}>
        <div className={styles.top}>
          {/* The staff beside the question, so feedback never pushes the neck off screen. */}
          <Staff
            notes={notes}
            keySignature={prompt.tonic}
            revealPitches={Boolean(feedback) || guided}
            className={styles.staff}
            label={d25StaffLabel(prompt)}
          />
          <div className={styles.ask}>
            <p className={styles.prompt} id="drill-prompt">
              {guided ? (
                <>
                  {d25Fact(prompt)} Tap <strong>{answer}</strong> to continue.
                </>
              ) : (
                D25_TASK
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
                    : c === prompt.answer && !feedback.result.correct
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
                    aria-label={spoken(c)}
                    aria-keyshortcuts={d25KeysFor(i)}
                  >
                    {pretty(c)}
                  </button>
                );
              })}
            </div>
            {feedback && (
              <div className={styles.feedback} data-testid="d25-feedback">
                {explanation && <p>{explanation}</p>}
                <p>{d25Fact(prompt)}</p>
              </div>
            )}
          </div>
        </div>
        {sizeClass === 'regular-wide' && aside}
      </div>
      <div className={styles.neckArea}>
        <Fretboard
          tuning={tuning}
          fretRange={range}
          {...(position ? { activeRange: positionReach(position) } : {})}
          handedness={handedness}
          markers={markers}
          guideLevel={level}
          blindMode={blindMode}
          label={
            position
              ? `Fretboard, ${position.label.toLowerCase()} shown`
              : 'Fretboard, the note’s fret shown after you answer'
          }
        />
      </div>
      {/* iPad portrait: the context panel sits below the neck; compact styles it as a sheet. */}
      {sizeClass !== 'regular-wide' && aside}
    </div>
  );
}
