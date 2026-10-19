import { useEffect } from 'react';
import type { DrillRenderProps } from '../types';
import {
  d11Convention,
  d11Explain,
  d11KeyToAnswer,
  d11SpokenCue,
  d11Strip,
  d11Task,
  d11WorkedExample,
  nashvilleParts,
  prettyChoice,
  prettyChord,
  prettyKey,
  prettyNumeral,
  spokenChoice,
  type D11Answer,
  type D11Prompt,
} from './logic';
import styles from './D11View.module.css';

const STRIP_MARK = { answer: '✓', given: '✗' } as const;
const STRIP_TEXT = { answer: 'the answer', given: 'your answer' } as const;

/** The cue as read: a Roman numeral, a Nashville number (suffix set apart) or a chord. */
function Cue({ prompt }: { prompt: D11Prompt }) {
  let content;
  if (prompt.kind === 'nashville') {
    const { degree, suffix } = nashvilleParts(prompt.target.nashville);
    content = (
      <>
        {degree}
        {suffix && <span className={styles.suffix}>{suffix}</span>}
      </>
    );
  } else if (prompt.kind === 'numeral') {
    content = prettyNumeral(prompt.target.roman);
  } else {
    content = prettyChord(prompt.target.symbol);
  }
  return (
    <p className={styles.cue} data-testid="d11-cue" aria-label={d11SpokenCue(prompt)}>
      <span aria-hidden="true">{content}</span>
    </p>
  );
}

/**
 * D11 view (design §6 D11): the key, the cue (a numeral, a Nashville number
 * or a chord) and a row of choices. There is no neck: the key's chords are
 * the picture. Feedback lays them out in scale order with the answer marked
 * (✓) and the chosen chord marked (✗), so the learner sees where the chord
 * sits, hears it, and reads its name (rule 10).
 */
export function D11View({
  prompt,
  guided,
  sizeClass,
  feedback,
  onAnswer,
  aside,
}: DrillRenderProps<D11Prompt, D11Answer>) {
  useEffect(() => {
    if (feedback) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const answer = d11KeyToAnswer(e.key, prompt.choices);
      if (answer) {
        e.preventDefault();
        onAnswer(answer);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [feedback, onAnswer, prompt.choices]);

  const convention = d11Convention(prompt.key);
  const explanation =
    feedback && !feedback.result.correct ? d11Explain(prompt, feedback.answer) : [];
  // The worked example shows the key's chords up front (rule 8); otherwise
  // they appear only once answered (rule 4).
  const strip = feedback || guided ? d11Strip(prompt, feedback?.answer ?? null) : null;
  const key = prettyKey(prompt.key);

  return (
    <div className={styles.drill} data-size-class={sizeClass} data-testid="d11-drill">
      <div className={styles.upper}>
        <div className={styles.top}>
          <div className={styles.question}>
            <p className={styles.key} data-testid="d11-key">
              {key}
            </p>
            <Cue prompt={prompt} />
            <p className={styles.prompt} id="drill-prompt">
              {guided ? (
                <>
                  {d11WorkedExample(prompt)} Tap{' '}
                  <strong>{prettyChoice(prompt, prompt.answer)}</strong> to continue.
                </>
              ) : (
                d11Task(prompt)
              )}
            </p>
            {convention && (
              <p className={styles.convention} data-testid="d11-convention">
                {convention}
              </p>
            )}
          </div>
          <div
            className={styles.choices}
            role="group"
            aria-labelledby="drill-prompt"
            data-ask={prompt.ask}
          >
            {prompt.choices.map((c, i) => {
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
                  aria-label={spokenChoice(prompt, c)}
                  aria-keyshortcuts={String(i + 1)}
                >
                  {prettyChoice(prompt, c)}
                </button>
              );
            })}
          </div>
          {strip && (
            <ol className={styles.strip} aria-label={`Chords in ${key}`} data-testid="d11-strip">
              {strip.map((c) => (
                <li
                  key={c.degree}
                  className={styles.stripChord}
                  data-state={c.state ?? undefined}
                  aria-label={`${c.label}: ${c.symbol}${c.state ? `, ${STRIP_TEXT[c.state]}` : ''}`}
                >
                  <span className={styles.stripLabel} aria-hidden="true">
                    {c.label}
                  </span>
                  <span className={styles.stripSymbol} aria-hidden="true">
                    {c.symbol}
                  </span>
                  {c.state && (
                    <span className={styles.mark} aria-hidden="true">
                      {STRIP_MARK[c.state]}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          )}
          {explanation.length > 0 && (
            <ul className={styles.explanation} data-testid="d11-explanation">
              {explanation.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
        </div>
        {sizeClass === 'regular-wide' && aside}
      </div>
      {/* iPad portrait: below. Compact: the session styles it as a sheet. */}
      {sizeClass !== 'regular-wide' && aside}
    </div>
  );
}
