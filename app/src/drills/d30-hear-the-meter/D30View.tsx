import { useEffect } from 'react';
import { useAppStore } from '../../app-store';
import { Staff, type StaffNote } from '../../components/staff';
import { parseTimeSignature } from '../../theory';
import type { DrillRenderProps } from '../types';
import {
  d30BeatNotes,
  d30Clip,
  d30KeyFor,
  d30KeyToAnswer,
  type D30Answer,
  type D30Prompt,
} from './logic';
import { playClip, stopClip } from './play';
import {
  d30Count,
  d30Explain,
  d30Fact,
  d30Spoken,
  d30SubLabel,
  d30Task,
  d30WorkedExample,
} from './text';
import styles from './D30View.module.css';

/** The key that plays the clip again (the number row answers). */
const REPLAY_KEY = 'r';

/**
 * D30 view (design §6 D30, §12): the clip plays as the prompt opens, with a
 * button (and R) to hear it again, then one row of meter names. Sound before
 * symbol: nothing on screen shows the beat while the clip plays. With the
 * feedback come the time signature, one note per felt beat and the counting,
 * beside the sound and its name (research/02 rule 10). A wrong answer
 * replays the right meter, and both can be heard again side by side, in the
 * same sound and tempo.
 */
export function D30View({
  prompt,
  guided,
  sizeClass,
  feedback,
  onAnswer,
  aside,
}: DrillRenderProps<D30Prompt, D30Answer>) {
  const soundOn = useAppStore((s) => s.settings.soundOn);
  const { choices } = prompt;

  const play = (meter: D30Answer) => void playClip(d30Clip(prompt, meter), { fromGesture: true });

  // The prompt is the sound: play it as the prompt opens, and stop it when it goes.
  useEffect(() => {
    void playClip(d30Clip(prompt));
    return stopClip;
  }, [prompt]);

  // A wrong answer hears the right meter again, now with its name.
  const wrong = feedback !== null && !feedback.result.correct;
  useEffect(() => {
    if (wrong) void playClip(d30Clip(prompt));
  }, [wrong, prompt]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.toLowerCase() === REPLAY_KEY) {
        e.preventDefault();
        void playClip(d30Clip(prompt), { fromGesture: true });
        return;
      }
      if (feedback) return;
      const answer = d30KeyToAnswer(e.key, choices);
      if (answer) {
        e.preventDefault();
        onAnswer(answer);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [feedback, onAnswer, choices, prompt]);

  const explanation = feedback ? d30Explain(prompt, feedback.answer) : null;

  return (
    <div
      className={styles.drill}
      data-size-class={sizeClass}
      data-testid="d30-drill"
      data-item={prompt.itemId}
      data-style={prompt.style}
    >
      <div className={styles.upper}>
        <div className={styles.top}>
          <div className={styles.ask}>
            <button
              type="button"
              className={styles.play}
              onClick={() => play(prompt.meter)}
              aria-keyshortcuts="R"
            >
              <span aria-hidden="true" className={styles.icon}>
                ▶
              </span>
              Play again
            </button>
            <p className={styles.prompt} id="drill-prompt">
              {guided && !feedback ? (
                <>
                  {d30WorkedExample(prompt)} Listen, then tap <strong>{prompt.meter}</strong>.
                </>
              ) : (
                d30Task()
              )}
            </p>
          </div>
          {!soundOn && (
            <p className={styles.notice} role="status">
              Sound is off, so the clip is silent. Turn it on in Settings → Sound.
            </p>
          )}
          <div className={styles.choices} role="group" aria-labelledby="drill-prompt">
            {choices.map((c, i) => {
              const state = !feedback
                ? undefined
                : c === feedback.answer
                  ? feedback.result.correct
                    ? 'correct'
                    : 'wrong'
                  : c === prompt.meter && !feedback.result.correct
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
                  aria-label={d30Spoken(c)}
                  aria-keyshortcuts={d30KeyFor(i)}
                >
                  <span className={styles.main}>{c}</span>
                  <span className={styles.sub}>{d30SubLabel(c)}</span>
                </button>
              );
            })}
          </div>
          {feedback && (
            <div className={styles.feedback} data-testid="d30-feedback">
              <p>
                {explanation && <>{explanation} </>}
                {d30Fact(prompt)}
              </p>
              {wrong && (
                <div className={styles.compare} role="group" aria-label="Compare the meters">
                  <button type="button" onClick={() => play(prompt.meter)}>
                    Hear the answer: {prompt.meter}
                  </button>
                  <button type="button" onClick={() => play(feedback.answer)}>
                    Hear yours: {feedback.answer}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        {sizeClass === 'regular-wide' && aside}
      </div>
      {feedback && <Notation prompt={prompt} />}
      {/* iPad portrait: below. Compact: the session styles it as a sheet. */}
      {sizeClass !== 'regular-wide' && aside}
    </div>
  );
}

/** Every beat on the staff's middle line (B4 written, B3 sounding): rhythm, not pitch. */
const BEAT_PITCH = 'B3';

/** The symbol, after the answer: the time signature, one note per felt beat, and the counting. */
function Notation({ prompt }: { prompt: D30Prompt }) {
  const ts = parseTimeSignature(prompt.signature);
  const notes: StaffNote[] = d30BeatNotes(ts).map((n) => ({
    pitches: [BEAT_PITCH],
    value: n.value,
    dots: n.dots,
  }));
  const count = d30Count(ts);
  const spoken = count.map((s) => s.syllable).join(' ');
  return (
    <div className={styles.notation} data-testid="d30-notation">
      <Staff
        notes={notes}
        timeSignature={`${ts.top}/${ts.bottom}`}
        className={styles.staff}
        revealPitches={false}
        label={`One bar of ${prompt.signature}: ${notes.length} beats`}
      />
      <ol className={styles.count} aria-label={`Counted ${spoken}`}>
        {count.map((s, i) => (
          <li key={i} data-accent={s.accent}>
            {s.syllable}
          </li>
        ))}
      </ol>
    </div>
  );
}
