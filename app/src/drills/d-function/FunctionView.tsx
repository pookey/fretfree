import { useEffect } from 'react';
import type { DrillRenderProps } from '../types';
import { prettyKey } from '../d11-numerals/logic';
import { dfKeyToAnswer, type DfAnswer, type DfPrompt } from './logic';
import { dfCue, dfCueNote, dfDisplay, dfExplain, dfFact, dfSpoken, dfTask } from './text';
import styles from './FunctionView.module.css';

/** Choices whose labels are words or chord runs get wide buttons. */
const WIDE = new Set(['minor-source', 'function', 'two-five', 'secondary-of']);

/**
 * The function drill's view (design §6): the key, the cue (a numeral, a
 * chord or "ii–V–i") and a row of choices. A borrowed card has no cue: its
 * progression is the row, in playing order. There is no neck. Feedback
 * marks the buttons by border style as well as colour, says why a wrong
 * choice is wrong, then states the fact, while the chords sound (rule 10).
 * The fact is stated once: by the worked example until it is answered, then
 * by the feedback, with the task back in the prompt line.
 */
export function FunctionView({
  prompt,
  guided,
  sizeClass,
  feedback,
  onAnswer,
  aside,
}: DrillRenderProps<DfPrompt, DfAnswer>) {
  const { choices } = prompt;

  useEffect(() => {
    if (feedback) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const answer = dfKeyToAnswer(e.key, choices);
      if (answer) {
        e.preventDefault();
        onAnswer(answer);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [feedback, onAnswer, choices]);

  const cue = dfCue(prompt);
  const cueNote = dfCueNote(prompt);
  const explanation =
    feedback && !feedback.result.correct ? dfExplain(prompt, feedback.answer) : [];

  return (
    <div className={styles.drill} data-size-class={sizeClass} data-testid="df-drill">
      <div className={styles.upper}>
        <div className={styles.top}>
          <div className={styles.question}>
            {prompt.key && (
              <p className={styles.key} data-testid="df-key">
                {prettyKey(prompt.key)}
              </p>
            )}
            {cue && (
              <p className={styles.cue} data-testid="df-cue">
                {cue}
              </p>
            )}
            {cueNote && (
              <p className={styles.cueNote} data-testid="df-cue-note">
                {cueNote}
              </p>
            )}
            <p className={styles.prompt} id="drill-prompt">
              {/* Once answered, the feedback states the fact: the worked
                  example's words would say it twice, and "Tap" is spent. */}
              {guided && !feedback ? (
                <>
                  {dfFact(prompt)} Tap <strong>{dfDisplay(prompt, prompt.answer)}</strong> to
                  continue.
                </>
              ) : (
                dfTask(prompt)
              )}
            </p>
          </div>
          <div
            className={styles.choices}
            data-wide={WIDE.has(prompt.kind) || undefined}
            data-progression={prompt.progression ? true : undefined}
            role="group"
            aria-labelledby="drill-prompt"
          >
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
                  aria-label={dfSpoken(prompt, c)}
                  aria-keyshortcuts={String(i + 1)}
                >
                  {dfDisplay(prompt, c)}
                </button>
              );
            })}
          </div>
          {feedback && (
            <div className={styles.feedback} data-testid="df-feedback">
              {explanation.length > 0 && (
                <ul className={styles.explanation} data-testid="df-explanation">
                  {explanation.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              )}
              <p className={styles.fact}>{dfFact(prompt)}</p>
            </div>
          )}
        </div>
        {sizeClass === 'regular-wide' && aside}
      </div>
      {/* iPad portrait: below. Compact: the session styles it as a sheet. */}
      {sizeClass !== 'regular-wide' && aside}
    </div>
  );
}
