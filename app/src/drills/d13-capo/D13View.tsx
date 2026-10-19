import { useEffect, useState } from 'react';
import type { GuideLevel } from '../../engine/model';
import type { DrillRenderProps } from '../types';
import { CapoNeck } from './CapoNeck';
import {
  d13Answer,
  d13Explain,
  d13Guides,
  d13Hint,
  d13Pretty,
  d13Question,
  d13Spoken,
  d13TypeKey,
  d13WorkedExample,
  type D13Answer,
  type D13Prompt,
} from './logic';
import styles from './D13View.module.css';

/**
 * D13 view (design §6 D13, §7). The question names two of shapes, capo fret
 * and sounding key; the buttons offer the third. Below, the neck from the nut
 * shows the capo and the half-step ladder it climbs: only what the question
 * gives before an answer, every rung named in the worked example and in
 * feedback, so the raise is seen as well as heard.
 */
export function D13View({
  prompt,
  guideLevel,
  guided,
  handedness,
  sizeClass,
  feedback,
  onAnswer,
  aside,
}: DrillRenderProps<D13Prompt, D13Answer>) {
  const { choices, ask } = prompt;
  // What has been typed so far, kept with its prompt so a new prompt starts empty.
  const [entry, setEntry] = useState({ itemId: prompt.itemId, typed: '' });
  const typed = entry.itemId === prompt.itemId ? entry.typed : '';

  useEffect(() => {
    if (feedback) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // Enter on a focused button presses it; only typed answers are ours.
      if (e.key === 'Enter' && typed === '') return;
      const next = d13TypeKey(typed, e.key, ask, choices);
      if (next.typed === typed && next.answer === null) return;
      e.preventDefault();
      setEntry({ itemId: prompt.itemId, typed: next.typed });
      if (next.answer !== null) onAnswer(next.answer);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [feedback, onAnswer, ask, choices, typed, prompt.itemId]);

  // The worked example shows full guides (design §3.3 step 2).
  const level: GuideLevel = guided ? 3 : guideLevel;
  const guides = d13Guides(level);
  const expected = d13Answer(prompt);

  let hint = '';
  if (feedback) hint = feedback.result.correct ? '' : d13Explain(prompt, feedback.answer);
  else if (typed) hint = `Typed ${d13Pretty(typed)}. Press Enter to answer.`;
  else if (guides.hint && !guided) hint = d13Hint(prompt);

  return (
    <div
      className={styles.drill}
      data-testid="d13-drill"
      data-size-class={sizeClass}
      data-ask={ask}
      data-capo={prompt.capo}
      data-level={prompt.level}
    >
      <div className={styles.upper}>
        <div className={styles.top}>
          <p className={styles.prompt} id="drill-prompt" data-testid="d13-prompt">
            {guided ? (
              <>
                {d13WorkedExample(prompt)} Tap <strong>{d13Pretty(expected)}</strong> to continue.
              </>
            ) : (
              d13Question(prompt)
            )}
          </p>
          {feedback && (
            <p className={styles.summary} data-testid="d13-summary">
              {d13WorkedExample(prompt)}
            </p>
          )}
          <p className={styles.hint} data-testid="d13-hint" aria-live="polite">
            {hint}
          </p>
          <div
            className={styles.choices}
            role="group"
            aria-labelledby="drill-prompt"
            data-ask={ask}
          >
            {choices.map((c) => {
              const state = !feedback
                ? undefined
                : c === feedback.answer
                  ? feedback.result.correct
                    ? 'correct'
                    : 'wrong'
                  : c === expected && !feedback.result.correct
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
                  aria-label={d13Spoken(prompt, c)}
                >
                  {d13Pretty(c)}
                </button>
              );
            })}
          </div>
        </div>
        {sizeClass === 'regular-wide' && aside}
      </div>
      <CapoNeck
        prompt={prompt}
        revealed={Boolean(feedback) || guided}
        fretNumbers={guides.fretNumbers}
        handedness={handedness}
      />
      {/* Below the neck on iPad portrait; the session shows it as a sheet on compact. */}
      {sizeClass !== 'regular-wide' && aside}
    </div>
  );
}
