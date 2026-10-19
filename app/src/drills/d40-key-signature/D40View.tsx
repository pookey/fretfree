import { useEffect } from 'react';
import type { DrillRenderProps } from '../types';
import {
  d40Explain,
  d40Fact,
  d40KeyFor,
  d40KeyToAnswer,
  d40Subject,
  d40Task,
  display,
  parseSignatureCode,
  signatureNotes,
  spokenChoice,
  type D40Answer,
  type D40Prompt,
} from './logic';
import styles from './D40View.module.css';

/**
 * D40 view (design §6 D40): the key or signature in large type, the
 * question, and one row of answer buttons. Signature buttons show their
 * count large and their sharps or flats below. Feedback marks the buttons by
 * border style as well as colour, then names the fact and, for a wrong
 * answer, what the chosen button is the answer to.
 */
export function D40View({
  prompt,
  guided,
  sizeClass,
  feedback,
  onAnswer,
  aside,
}: DrillRenderProps<D40Prompt, D40Answer>) {
  const { choices } = prompt;

  useEffect(() => {
    if (feedback) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const answer = d40KeyToAnswer(e.key, choices);
      if (answer) {
        e.preventDefault();
        onAnswer(answer);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [feedback, onAnswer, choices]);

  const explanation = feedback ? d40Explain(prompt, feedback.answer) : null;
  const signatures = prompt.kind === 'key-signature';

  return (
    <div className={styles.drill} data-size-class={sizeClass} data-testid="d40-drill">
      <div className={styles.upper}>
        <div className={styles.top}>
          <p className={styles.subject} data-testid="d40-subject">
            {d40Subject(prompt)}
          </p>
          <p className={styles.prompt} id="drill-prompt">
            {guided ? (
              <>
                {d40Fact(prompt)} Tap <strong>{display(prompt.kind, prompt.answer)}</strong> to
                continue.
              </>
            ) : (
              d40Task(prompt)
            )}
          </p>
          <div
            className={styles.choices}
            data-signatures={signatures || undefined}
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
              const alteration = signatures ? parseSignatureCode(c) : null;
              return (
                <button
                  key={c}
                  type="button"
                  className={styles.choice}
                  data-state={state}
                  disabled={Boolean(feedback)}
                  onClick={() => onAnswer(c)}
                  aria-label={spokenChoice(prompt.kind, c)}
                  aria-keyshortcuts={d40KeyFor(i)}
                >
                  <span className={styles.main}>{display(prompt.kind, c)}</span>
                  {alteration !== null && (
                    <span className={styles.notes}>
                      {alteration === 0 ? 'none' : signatureNotes(alteration).join(' ')}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {feedback && (
            <div className={styles.feedback} data-testid="d40-feedback">
              {explanation && <p>{explanation}</p>}
              <p>{d40Fact(prompt)}</p>
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
