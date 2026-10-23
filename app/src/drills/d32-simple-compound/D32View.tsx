import { useEffect, useRef } from 'react';
import type { Metronome } from '../../timing/metronome';
import type { DrillRenderProps } from '../types';
import { BeatStrip } from './BeatStrip';
import {
  d32KeyFor,
  d32Keys,
  d32ReadKeys,
  display,
  meterOfChoice,
  type D32Answer,
  type D32Prompt,
} from './logic';
import { d32BeatsSubject, d32Explain, d32Fact, d32Task, spokenChoice, spokenMeter } from './text';
import styles from './D32View.module.css';

export interface D32ViewProps extends DrillRenderProps<D32Prompt, D32Answer> {
  /** The timing engine's shared click; tests pass a fake. */
  metronome?: Metronome;
}

/** A time signature as it is printed: the top number over the bottom one. */
function Signature({ meter }: { meter: string }) {
  const [top, bottom] = meter.split('/');
  return (
    <span className={styles.signature} role="img" aria-label={spokenMeter(meter)}>
      <span>{top}</span>
      <span>{bottom}</span>
    </span>
  );
}

/**
 * D32 view (design §6 D32): the time signature printed large (or, asked the
 * other way, its beats in words), the question, and one row of answer
 * buttons. Feedback marks the buttons by border style as well as colour,
 * names the fact, and draws the bar's felt beats, with the meter a wrong
 * choice belongs to beside it (6/8 next to 3/4) and a button to hear each.
 * The worked example shows the same before the first answer.
 */
export function D32View({
  prompt,
  guided,
  sizeClass,
  feedback,
  onAnswer,
  aside,
  metronome,
}: D32ViewProps) {
  const { choices, fact } = prompt;
  const typed = useRef('');

  useEffect(() => {
    typed.current = '';
    if (feedback) return;
    const keys = d32Keys(fact, choices);
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const read = d32ReadKeys(typed.current, e.key.toLowerCase(), keys);
      typed.current = read.typed;
      if (read.answer !== null || read.typed) e.preventDefault();
      if (read.answer !== null) onAnswer(read.answer);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [feedback, onAnswer, choices, fact]);

  const explanation = feedback ? d32Explain(prompt, feedback.answer) : null;
  const other =
    feedback && !feedback.result.correct ? meterOfChoice(prompt, feedback.answer) : null;
  const showFact = guided || Boolean(feedback);

  return (
    <div className={styles.drill} data-size-class={sizeClass} data-testid="d32-drill">
      <div className={styles.upper}>
        <div className={styles.top}>
          <div className={styles.subject} data-testid="d32-subject">
            {fact === 'fromBeats' ? (
              <p className={styles.beats}>{d32BeatsSubject(prompt)}</p>
            ) : (
              <Signature meter={prompt.meter} />
            )}
          </div>
          <p className={styles.prompt} id="drill-prompt">
            {guided ? (
              <>
                {d32Task(prompt)} Tap <strong>{display(fact, prompt.answer)}</strong> to continue.
              </>
            ) : (
              d32Task(prompt)
            )}
          </p>
          <div
            className={styles.choices}
            data-fact={fact}
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
                  aria-label={spokenChoice(fact, c)}
                  aria-keyshortcuts={d32KeyFor(fact, choices, i)}
                >
                  {display(fact, c)}
                </button>
              );
            })}
          </div>
          {showFact && (
            <div className={styles.feedback} data-testid="d32-feedback">
              {explanation && <p>{explanation}</p>}
              <p>{d32Fact(prompt)}</p>
              <div className={styles.strips}>
                <BeatStrip meter={prompt.meter} metronome={metronome} />
                {other && <BeatStrip meter={other} metronome={metronome} />}
              </div>
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
