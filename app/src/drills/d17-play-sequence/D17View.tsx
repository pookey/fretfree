import { useCallback, useEffect, useRef, useState } from 'react';
import { Fretboard, type FretMarker } from '../../components/fretboard/Fretboard';
import type { GuideLevel } from '../../engine/model';
import type { PitchSourceErrorReason } from '../../mic/types';
import { midiToFretNote, type FretRange } from '../../theory';
import type { DrillRenderProps } from '../types';
import { useMic, useNotes } from './listen';
import { MIC_COPY, MIC_PROBLEM } from './mic-copy';
import {
  d17Accepts,
  d17Explain,
  d17Hint,
  d17Judge,
  d17PlaybackMs,
  d17Replay,
  d17Task,
  d17WorkedExample,
  pretty,
  type D17Answer,
  type D17Prompt,
} from './logic';
import styles from './D17View.module.css';

const WIDE: FretRange = { from: 0, to: 15 };
const REGULAR: FretRange = { from: 0, to: 12 };
const REGULAR_HIGH: FretRange = { from: 3, to: 15 };

/**
 * D17 view: "Play A, then the major 3rd above it" (design §6 D17, §7 session
 * layout). The learner plays on a real guitar and the mic hears each note in
 * turn; a row of slots fills as they land, without naming notes still to
 * come. The neck marks the root at scope 0 and shows one fingering on a
 * guided first rep and in feedback. "Show me the answer" is the keyboard path, and the
 * way out when there is no mic.
 */
export function D17View({
  prompt,
  guideLevel,
  guided,
  handedness,
  sizeClass,
  tuning,
  feedback,
  onAnswer,
  aside,
  blindMode,
}: DrillRenderProps<D17Prompt, D17Answer>) {
  const mic = useMic();
  // The notes credited so far, kept with their prompt so a new prompt starts afresh.
  const [progress, setProgress] = useState<{ prompt: D17Prompt; notes: number[] }>({
    prompt,
    notes: [],
  });
  const credited = progress.prompt === prompt ? progress.notes : [];
  const heard = useRef<number[]>([]);
  const answered = useRef(false);
  const shownAt = useRef(0);
  const runningAt = useRef(0);
  const quietUntil = useRef(0);

  // A new prompt starts afresh, timed from when it appeared.
  useEffect(() => {
    shownAt.current = performance.now();
    heard.current = [];
    answered.current = false;
  }, [prompt]);

  useEffect(() => {
    if (mic.state === 'running') runningAt.current = performance.now();
  }, [mic.state]);

  // A miss is played back: notes that start while it sounds are the speaker's.
  useEffect(() => {
    if (feedback && !feedback.result.correct) {
      quietUntil.current = performance.now() + d17PlaybackMs(prompt.steps.length);
    }
  }, [feedback, prompt]);

  const listenedMs = (now: number) =>
    Math.max(0, now - Math.max(shownAt.current, runningAt.current));

  const answer = useCallback(
    (a: D17Answer) => {
      if (answered.current) return;
      answered.current = true;
      onAnswer(a);
    },
    [onAnswer],
  );

  const listening = mic.state === 'running' && !feedback;
  useNotes(
    mic.source,
    listening,
    useCallback(
      (note, startedAt, now) => {
        if (answered.current || !d17Accepts(startedAt, shownAt.current, quietUntil.current)) return;
        const verdict = d17Judge(prompt, heard.current, note.midi);
        if (verdict === 'repeat') return;
        if (verdict === 'wrong') {
          answer({ played: [...heard.current, note.midi], responseMs: listenedMs(now) });
          return;
        }
        heard.current = [...heard.current, note.midi];
        setProgress({ prompt, notes: heard.current });
        if (heard.current.length === prompt.steps.length) {
          answer({ played: heard.current, responseMs: listenedMs(now) });
        }
      },
      [prompt, answer],
    ),
  );

  const showMe = () => {
    if (feedback) return;
    answer({ played: heard.current, gaveUp: true, responseMs: listenedMs(performance.now()) });
  };

  const visible =
    sizeClass === 'regular-wide'
      ? WIDE
      : sizeClass === 'regular'
        ? prompt.span.to > REGULAR.to
          ? REGULAR_HIGH
          : REGULAR
        : prompt.window;
  const level: GuideLevel = guided ? 3 : guideLevel;
  const root = prompt.steps[0]!;
  const showRoot = prompt.scope === 'placed' || guided;
  const showFingering = guided || feedback !== null;
  const markers: FretMarker[] = showFingering
    ? prompt.steps.map((s, i) => ({
        ...s.position,
        style: i === 0 ? 'root' : feedback ? 'correct' : 'tone',
        // The worked example numbers the order; feedback names each note.
        label: feedback ? pretty(s.note) : String(i + 1),
        forceLabel: true,
      }))
    : showRoot
      ? [{ ...root.position, style: 'root', label: pretty(root.note) }]
      : [];

  // In feedback the slots show the whole sequence, and where it went wrong.
  const result = feedback ? d17Replay(prompt, feedback.answer.played) : null;
  const shown = result ? result.credited : credited;

  return (
    <div className={styles.drill} data-size-class={sizeClass} data-scope={prompt.scope}>
      <div className={styles.upper}>
        <div className={styles.top}>
          <p className={styles.prompt} id="drill-prompt" data-testid="d17-prompt">
            {d17Task(prompt)}
          </p>
          <p className={styles.explain} data-testid="d17-explain">
            {feedback
              ? d17Explain(prompt, feedback)
              : guided
                ? d17WorkedExample(prompt)
                : level >= 2
                  ? d17Hint(prompt)
                  : null}
          </p>
          <ol className={styles.slots} aria-label="Notes heard" data-testid="d17-slots">
            {prompt.steps.map((s, i) => {
              const got = shown[i];
              const wrongHere = result?.status === 'wrong' && i === result.credited.length;
              const state =
                got !== undefined ? 'heard' : wrongHere ? 'wrong' : feedback ? 'expected' : 'open';
              // The wrong slot names the note played; the explanation names the one wanted.
              const played =
                wrongHere && result.wrong !== null
                  ? pretty(midiToFretNote(result.wrong, prompt.accidentalPref).pc)
                  : '';
              const name =
                state === 'wrong'
                  ? played
                  : got !== undefined || feedback
                    ? pretty(s.note)
                    : listening && i === shown.length
                      ? '…'
                      : '';
              const said =
                state === 'heard'
                  ? `heard ${pretty(s.note)}`
                  : state === 'wrong'
                    ? `heard ${played}, wanted ${pretty(s.note)}`
                    : feedback
                      ? pretty(s.note)
                      : 'not yet';
              return (
                <li
                  key={i}
                  className={styles.slot}
                  data-state={state}
                  aria-label={`Note ${i + 1} of ${prompt.steps.length}: ${said}`}
                >
                  <span aria-hidden="true" className={styles.mark}>
                    {state === 'heard' ? '✓' : state === 'wrong' ? '✗' : i + 1}
                  </span>
                  <span aria-hidden="true">{name}</span>
                </li>
              );
            })}
          </ol>
          {!feedback && (
            <MicPanel
              state={mic.state}
              reason={mic.error?.reason ?? null}
              heardCount={credited.length}
              total={prompt.steps.length}
              lastHeard={
                credited.length > 0 ? pretty(prompt.steps[credited.length - 1]!.note) : null
              }
              onStart={mic.start}
              onShowMe={showMe}
            />
          )}
        </div>
        {sizeClass === 'regular-wide' && aside}
      </div>
      <div className={styles.neckArea}>
        <Fretboard
          tuning={tuning}
          fretRange={visible}
          handedness={handedness}
          markers={markers}
          guideLevel={level}
          blindMode={blindMode ?? false}
          accidentalPref={prompt.accidentalPref}
          label={
            showRoot
              ? `Fretboard: the root, ${pretty(root.note)}, on string ${root.position.string}, fret ${root.position.fret}.`
              : 'Fretboard'
          }
        />
      </div>
      {/* iPad portrait: the context panel sits below the neck. */}
      {sizeClass === 'regular' && aside}
    </div>
  );
}

interface MicPanelProps {
  state: 'idle' | 'starting' | 'running' | 'error';
  reason: PitchSourceErrorReason | null;
  heardCount: number;
  total: number;
  /** The last note credited, by name. */
  lastHeard: string | null;
  onStart(): void;
  onShowMe(): void;
}

function MicPanel({
  state,
  reason,
  heardCount,
  total,
  lastHeard,
  onStart,
  onShowMe,
}: MicPanelProps) {
  return (
    <div className={styles.mic} data-mic-state={state}>
      {state === 'idle' && (
        <>
          <button type="button" className={styles.primary} onClick={onStart}>
            {MIC_COPY.start}
          </button>
          <p className={styles.note}>{MIC_COPY.idle}</p>
        </>
      )}
      {state === 'starting' && (
        <p role="status" className={styles.status}>
          {MIC_COPY.starting}
        </p>
      )}
      {state === 'running' && (
        <p role="status" className={styles.status} data-testid="d17-listening">
          <span className={styles.dot} aria-hidden="true" />
          {lastHeard === null
            ? MIC_COPY.listening
            : `Heard ${lastHeard}: ${heardCount} of ${total}.`}
        </p>
      )}
      {state === 'error' && (
        <>
          <p role="alert" className={styles.problem}>
            {MIC_PROBLEM[reason ?? 'failed']}
          </p>
          <button type="button" className={styles.primary} onClick={onStart}>
            {MIC_COPY.retry}
          </button>
        </>
      )}
      <button type="button" className={styles.secondary} onClick={onShowMe}>
        Show me the answer
      </button>
    </div>
  );
}
