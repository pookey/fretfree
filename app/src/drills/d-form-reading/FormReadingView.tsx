import { useEffect, useMemo, useRef, useState } from 'react';
import type { DrillRenderProps } from '../types';
import { FormSheet, type BarState } from './FormSheet';
import {
  firstWrongTap,
  formReadingKeys,
  type FormReadingAnswer,
  type FormReadingPrompt,
} from './logic';
import { playTune, stopTune } from './play';
import {
  choiceLabel,
  formReadingExplain,
  formReadingFact,
  formReadingGuides,
  formReadingTask,
} from './text';
import styles from './FormReadingView.module.css';

export interface FormReadingViewProps extends DrillRenderProps<
  FormReadingPrompt,
  FormReadingAnswer
> {
  /** Plays the tune in order; tests pass a fake. */
  play?: typeof playTune;
}

/** The sheet's marks for a card: the bar asked about, then feedback. */
function barStates(
  prompt: FormReadingPrompt,
  answer: FormReadingAnswer | null,
  guided: boolean,
): Map<number, BarState> {
  const states = new Map<number, BarState>();
  const right = prompt.answer[0] ?? -1;
  switch (prompt.task) {
    case 'bar':
      if (!answer) {
        if (guided) states.set(right, 'asked');
        break;
      }
      states.set(right, answer[0] === right ? 'correct' : 'expected');
      if (answer[0] !== right) states.set(answer[0] ?? -1, 'wrong');
      break;
    case 'start':
      if (answer || guided) states.set(0, 'asked');
      break;
    case 'next':
      states.set(prompt.ask?.bar ?? -1, 'asked');
      if (!answer) break;
      states.set(right, answer[0] === right ? 'correct' : 'expected');
      if (answer[0] !== right) states.set(answer[0] ?? -1, 'wrong');
      break;
    case 'order': {
      if (!answer) break;
      const at = firstWrongTap(prompt, answer);
      if (at < 0) break;
      states.set(prompt.answer[at] ?? -1, 'expected');
      states.set(answer[at] ?? -1, 'wrong');
      break;
    }
  }
  return states;
}

/** Each bar's steps in a tap sequence, numbered from 1. */
function badgesOf(taps: readonly number[]): Map<number, number[]> {
  const out = new Map<number, number[]>();
  taps.forEach((bar, i) => out.set(bar, [...(out.get(bar) ?? []), i + 1]));
  return out;
}

/**
 * The form-reading view (T6): the question and its buttons beside the
 * context panel, and the tune across the full width below, as the neck
 * spans it in the neck drills (design §7). A pickup card's bars are
 * unnumbered until it is answered; a road map's are numbered, as a
 * reader needs them. Feedback marks the bars by fill and edge style, names
 * the order and its rules, and plays the tune in that order with each bar
 * lit as it sounds (rule 10). The worked example shows the same first.
 */
export function FormReadingView({
  prompt,
  guided,
  guideLevel,
  sizeClass,
  feedback,
  onAnswer,
  aside,
  play = playTune,
}: FormReadingViewProps) {
  // Taps and the bar lit belong to one card: a new prompt starts with neither.
  const [tapped, setTapped] = useState<{ prompt: FormReadingPrompt; bars: number[] }>({
    prompt,
    bars: [],
  });
  const [lit, setLit] = useState<{ prompt: FormReadingPrompt; bar: number } | null>(null);
  const taps = tapped.prompt === prompt ? tapped.bars : [];
  const playing = lit?.prompt === prompt ? lit.bar : null;
  const stop = useRef<(() => void) | null>(null);

  // Whatever was playing stops with its card.
  useEffect(
    () => () => {
      stop.current?.();
      stop.current = null;
      stopTune();
    },
    [prompt],
  );

  const answered = feedback?.answer ?? null;
  const tapBar = (bar: number) => {
    if (feedback) return;
    if (prompt.task === 'bar') {
      onAnswer([bar]);
      return;
    }
    const next = [...taps, bar];
    setTapped({ prompt, bars: next });
    // The first wrong tap ends the card, as does the last bar.
    if (bar !== prompt.answer[next.length - 1] || next.length === prompt.answer.length) {
      onAnswer(next);
    }
  };

  useEffect(() => {
    if (feedback) return;
    const keys = formReadingKeys(prompt);
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const value = keys.get(e.key);
      if (value === undefined) return;
      e.preventDefault();
      if (prompt.task === 'order') tapBar(value);
      else onAnswer([value]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const guides = formReadingGuides(prompt, guided ? 3 : guideLevel);
  const states = useMemo(() => barStates(prompt, answered, guided), [prompt, answered, guided]);
  const shownTaps = answered && prompt.task === 'order' ? answered : taps;
  const showFact = guided || Boolean(feedback);
  const explanation = feedback ? formReadingExplain(prompt, feedback.answer) : null;
  const tappable = prompt.task === 'bar' || prompt.task === 'order';

  const hear = async () => {
    if (stop.current) {
      stop.current();
      stop.current = null;
      setLit(null);
      return;
    }
    stop.current = await play(prompt, {
      onStep: (step) => setLit({ prompt, bar: prompt.order[step] ?? -1 }),
      onEnd: () => {
        stop.current = null;
        setLit(null);
      },
    });
  };

  return (
    <div className={styles.drill} data-size-class={sizeClass} data-testid="form-drill">
      <div className={styles.upper}>
        <div className={styles.top}>
          <p className={styles.prompt} id="drill-prompt">
            {formReadingTask(prompt, guided)}
          </p>
          {(prompt.task === 'start' || prompt.task === 'next') && (
            <div className={styles.choices} role="group" aria-labelledby="drill-prompt">
              {prompt.choices.map((c) => {
                const chose = answered?.[0];
                const right = prompt.answer[0];
                const state = !feedback
                  ? undefined
                  : c === chose
                    ? feedback.result.correct
                      ? 'correct'
                      : 'wrong'
                    : c === right && !feedback.result.correct
                      ? 'expected'
                      : undefined;
                const shown = prompt.task === 'next' ? c + 1 : c;
                return (
                  <button
                    key={c}
                    type="button"
                    className={styles.choice}
                    data-state={state}
                    disabled={Boolean(feedback)}
                    onClick={() => onAnswer([c])}
                    aria-label={choiceLabel(prompt, c)}
                    aria-keyshortcuts={String(shown)}
                  >
                    {shown}
                  </button>
                );
              })}
            </div>
          )}
          {prompt.task === 'order' && (
            <p className={styles.path} aria-live="polite" data-testid="form-path">
              {shownTaps.length > 0
                ? `Your order: ${shownTaps.map((i) => i + 1).join(' ')}`
                : 'Your order: tap the first bar.'}
            </p>
          )}
        </div>
        {sizeClass === 'regular-wide' && aside}
      </div>
      <div className={styles.sheet}>
        <FormSheet
          prompt={prompt}
          numbered={Boolean(prompt.shape) || showFact}
          counts={guides.counts}
          states={states}
          badges={prompt.task === 'order' ? badgesOf(shownTaps) : undefined}
          playing={playing}
          onTap={tappable ? tapBar : undefined}
          disabled={Boolean(feedback)}
        />
      </div>
      {showFact && (
        <div className={styles.feedback} data-testid="form-feedback">
          {explanation && <p>{explanation}</p>}
          {formReadingFact(prompt).map((f) => (
            <p key={f}>{f}</p>
          ))}
          <button
            type="button"
            className={styles.hear}
            onClick={() => void hear()}
            aria-pressed={playing !== null}
          >
            {playing !== null ? 'Stop' : 'Hear it in order'}
          </button>
        </div>
      )}
      {/* iPad portrait: below. Compact: the session styles it as a sheet. */}
      {sizeClass !== 'regular-wide' && aside}
    </div>
  );
}
