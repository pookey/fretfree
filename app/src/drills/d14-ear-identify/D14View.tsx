import { useEffect } from 'react';
import { useAppStore } from '../../app-store';
import { Fretboard, type FretMarker } from '../../components/fretboard/Fretboard';
import { neckWindow } from '../../shell/size-class';
import type { DrillRenderProps } from '../types';
import {
  d14Chart,
  d14Clip,
  d14KeyFor,
  d14KeyToAnswer,
  d14LongName,
  d14NeckNotes,
  d14ShortName,
  pretty,
  type D14Answer,
  type D14Prompt,
} from './logic';
import { playClip, stopClip } from './play';
import { d14Explain, d14Fact, d14KeyName, d14Spoken, d14SubLabel, d14Task } from './text';
import styles from './D14View.module.css';

/** The key that plays the clip again (the number row answers). */
const REPLAY_KEY = 'r';

/**
 * D14 view (design §6 D14): the clip plays as the prompt opens, with a
 * button (and R) to hear it again, then one row of answer buttons. Nothing
 * on screen gives the sound away: the neck and the chart appear only with
 * the feedback, beside the sound and its name (research/02 rule 10). A wrong
 * answer replays the right sound, and both can be heard again side by side,
 * built on the same note or key.
 */
export function D14View({
  prompt,
  guideLevel,
  guided,
  handedness,
  sizeClass,
  compactFrets,
  tuning,
  feedback,
  onAnswer,
  aside,
  blindMode = false,
}: DrillRenderProps<D14Prompt, D14Answer>) {
  const soundOn = useAppStore((s) => s.settings.soundOn);
  const { choices } = prompt;

  const play = (choice: string) => void playClip(d14Clip(prompt, choice));

  // The prompt is the sound: play it as the prompt opens, and stop it when it goes.
  useEffect(() => {
    void playClip(d14Clip(prompt, prompt.answer));
    return stopClip;
  }, [prompt]);

  // A wrong answer hears the right sound again, now with its name.
  const wrong = feedback !== null && !feedback.result.correct;
  useEffect(() => {
    if (wrong) void playClip(d14Clip(prompt, prompt.answer));
  }, [wrong, prompt]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.toLowerCase() === REPLAY_KEY) {
        e.preventDefault();
        void playClip(d14Clip(prompt, prompt.answer));
        return;
      }
      if (feedback) return;
      const answer = d14KeyToAnswer(e.key, choices);
      if (answer) {
        e.preventDefault();
        onAnswer(answer);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [feedback, onAnswer, choices, prompt]);

  const explanation = feedback ? d14Explain(prompt, feedback.answer) : null;
  // From guide level 2 the panel beside the feedback says what each sound
  // is like, so the feedback doesn't say it again. A compact sheet starts
  // closed, so there the feedback keeps it.
  const panelHasCues = Boolean(aside) && sizeClass !== 'compact' && (guided || guideLevel >= 2);

  return (
    <div
      className={styles.drill}
      data-size-class={sizeClass}
      data-wide={choices.length > 6 || undefined}
      data-testid="d14-drill"
      data-item={prompt.itemId}
    >
      <div className={styles.upper}>
        <div className={styles.top}>
          {/* The play button beside the question, so the neck fits below in feedback. */}
          <div className={styles.ask}>
            <button
              type="button"
              className={styles.play}
              onClick={() => play(prompt.answer)}
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
                  {d14Fact(prompt)} Listen, then tap{' '}
                  <strong>{d14ShortName(prompt.kind, prompt.answer)}</strong>.
                </>
              ) : (
                d14Task(prompt)
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
                  : c === prompt.answer && !feedback.result.correct
                    ? 'expected'
                    : undefined;
              const sub = d14SubLabel(prompt.kind, c);
              return (
                <button
                  key={c}
                  type="button"
                  className={styles.choice}
                  data-state={state}
                  disabled={Boolean(feedback)}
                  onClick={() => onAnswer(c)}
                  aria-label={d14Spoken(prompt.kind, c)}
                  aria-keyshortcuts={d14KeyFor(i)}
                >
                  <span className={styles.main}>{d14ShortName(prompt.kind, c)}</span>
                  {sub && <span className={styles.sub}>{sub}</span>}
                </button>
              );
            })}
          </div>
          {feedback && (
            <div className={styles.feedback} data-testid="d14-feedback">
              <p>
                {explanation && <>{explanation} </>}
                {d14Fact(prompt, { cue: !panelHasCues })}
              </p>
              {wrong && (
                <div className={styles.compare} role="group" aria-label="Compare the sounds">
                  <button type="button" onClick={() => play(prompt.answer)}>
                    Hear the answer: {d14LongName(prompt.kind, prompt.answer)}
                  </button>
                  <button type="button" onClick={() => play(feedback.answer)}>
                    Hear yours: {d14LongName(prompt.kind, feedback.answer)}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        {sizeClass === 'regular-wide' && aside}
      </div>
      {feedback && prompt.kind === 'progression' && <Chart prompt={prompt} />}
      {feedback && prompt.kind !== 'progression' && (
        <Neck
          prompt={prompt}
          handedness={handedness}
          sizeClass={sizeClass}
          compactFrets={compactFrets}
          tuning={tuning}
          blindMode={blindMode}
        />
      )}
      {/* iPad portrait: below. Compact: the session styles it as a sheet. */}
      {sizeClass !== 'regular-wide' && aside}
    </div>
  );
}

/** The progression's chords in the key it played in, each under its numeral. */
function Chart({ prompt }: { prompt: D14Prompt }) {
  const chart = d14Chart(prompt, prompt.answer);
  const name = `${pretty(d14LongName('progression', prompt.answer))} in ${d14KeyName(prompt)}`;
  return (
    <ol className={styles.chart} aria-label={`Chords of ${name}`}>
      {chart.map((c, i) => (
        <li key={i} className={styles.chord}>
          <span className={styles.symbol}>{pretty(c.symbol)}</span>
          <span className={styles.numeral}>{pretty(c.roman)}</span>
        </li>
      ))}
    </ol>
  );
}

const ROLE_STYLE = {
  root: 'root',
  third: 'third',
  fifth: 'fifth',
  seventh: 'seventh',
  other: 'correct',
} as const;

/**
 * Frets the feedback neck shows on iPad: a window round the notes, drawn at
 * the neck's smallest scale. It is a picture, not an answer surface, and a
 * full-width 15-fret neck would push it under the feedback bar.
 */
const NECK_FRETS = 8;

/** The answer on the neck: an interval's two notes, or the chord's grip. */
function Neck({
  prompt,
  handedness,
  sizeClass,
  compactFrets,
  tuning,
  blindMode,
}: Pick<
  DrillRenderProps<D14Prompt, D14Answer>,
  'prompt' | 'handedness' | 'sizeClass' | 'compactFrets' | 'tuning' | 'blindMode'
>) {
  const notes = d14NeckNotes(prompt, tuning);
  if (!notes) return null;
  const frets = notes.map((n) => n.fret);
  const mid = Math.floor((Math.min(...frets) + Math.max(...frets)) / 2);
  const markers = notes.map((n): FretMarker => ({
    string: n.string,
    fret: n.fret,
    style: ROLE_STYLE[n.role],
    // An interval's second note is named by the interval, as D5 does.
    label: prompt.kind === 'interval' && n.role === 'other' ? prompt.answer : pretty(n.pc),
    forceLabel: true,
  }));
  const what =
    prompt.kind === 'interval'
      ? `a ${d14LongName('interval', prompt.answer)}`
      : `a ${d14LongName('chord', prompt.answer)} chord`;
  return (
    <div className={styles.neckArea}>
      <Fretboard
        tuning={tuning}
        fretRange={neckWindow('compact', mid, sizeClass === 'compact' ? compactFrets : NECK_FRETS)}
        handedness={handedness}
        markers={markers}
        guideLevel={3}
        blindMode={blindMode}
        accidentalPref={prompt.pref}
        label={`Fretboard showing ${what}: ${notes
          .map((n) => `string ${n.string} fret ${n.fret}`)
          .join(', ')}`}
      />
    </div>
  );
}
