import { useEffect, useRef, useState } from 'react';
import { Fretboard, type FretMarker } from '../../components/fretboard/Fretboard';
import {
  getPitchSource,
  type PitchSource,
  type PitchSourceError,
  type PitchSourceErrorReason,
  type PitchSourceState,
} from '../../mic';
import { midiToFretNote, noteAt, type FretRange, type Position } from '../../theory';
import type { DrillFeedback, DrillRenderProps } from '../types';
import { createD16Listener } from './listen';
import {
  d16Explain,
  d16FeedbackPositions,
  d16ModeHint,
  d16NeckGuideLevel,
  d16Window,
  type D16Answer,
  type D16Prompt,
} from './logic';
import styles from './D16View.module.css';

const REGION: FretRange = { from: 0, to: 12 };
const COMPACT_FRETS = 5;

/** What to say when the mic can't start, by reason (design §9). */
const ERRORS: Record<PitchSourceErrorReason, string> = {
  denied:
    "FretFree can't hear you: microphone access was blocked. Allow it for this site in your browser's settings, then try again.",
  'no-device': 'No microphone was found. Connect one, then try again.',
  unsupported: "This browser can't listen for notes.",
  failed: "The microphone didn't start. Try again.",
};

interface Live {
  prompt: D16Prompt;
  feedback: DrillFeedback<D16Answer> | null;
  onAnswer(answer: D16Answer): void;
  /** The prompt already answered, so a second note can't answer it twice. */
  answered: D16Prompt | null;
}

/**
 * Listens for the answer. The mic starts only from the learner's tap (design
 * §9; iOS grants it only inside a gesture) and stops when the view goes, so
 * it is never on outside a mic drill. Consecutive D16 prompts share the view,
 * so the mic stays on between them.
 */
function useMicAnswer(
  prompt: D16Prompt,
  feedback: DrillFeedback<D16Answer> | null,
  onAnswer: (answer: D16Answer) => void,
) {
  const [source] = useState<PitchSource>(getPitchSource);
  const [listener] = useState(createD16Listener);
  const [state, setState] = useState<PitchSourceState>(source.state);
  // Bumped when a note starts or stops, so the "still ringing" line re-renders.
  const [, setTick] = useState(0);
  const live = useRef<Live>({ prompt, feedback, onAnswer, answered: null });

  // A new prompt is pinned to the last frame heard before it appeared.
  const [pinned, setPinned] = useState(prompt);
  if (pinned !== prompt) {
    setPinned(prompt);
    listener.prompt();
  }

  useEffect(() => {
    live.current = { ...live.current, prompt, feedback, onAnswer };
  }, [prompt, feedback, onAnswer]);

  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    const offs = [
      source.onStateChange((next) => {
        if (next === 'running') listener.reset();
        setState(next);
      }),
      source.onFrame((frame) => listener.frame(frame.at)),
      source.onNote((note) => {
        const answers = listener.note(note);
        bump();
        const now = live.current;
        if (!answers || now.feedback || now.answered === now.prompt) return;
        now.answered = now.prompt;
        now.onAnswer({ midi: note.midi, name: note.name, cents: note.cents });
      }),
      source.onNoteEnd((end) => {
        listener.noteEnd(end);
        bump();
      }),
    ];
    return () => {
      offs.forEach((off) => off());
      source.stop();
    };
  }, [source, listener]);

  // Called straight from the tap, before any await (iOS).
  const start = () => void source.start().catch(() => undefined);
  return { state, error: source.error, ringing: listener.ringing, start };
}

/**
 * D16 view: "Play A on string 6" above the neck; the learner plays it on a
 * real guitar (design §6 D16). Nothing on the neck marks the answer until
 * feedback, except on a guided first rep (the worked example).
 */
export function D16View({
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
  blindMode,
}: DrillRenderProps<D16Prompt, D16Answer>) {
  const compact = sizeClass === 'compact';
  const mic = useMicAnswer(prompt, feedback, onAnswer);

  const pcAt = (p: Position) => noteAt(p, tuning, prompt.accidentalPref).pc;
  const mark = (p: Position, style: FretMarker['style'], label = prompt.pc): FretMarker => ({
    ...p,
    style,
    label,
    forceLabel: true,
  });
  const markers: FretMarker[] = prompt.source ? [mark(prompt.source, 'root')] : [];
  if (feedback) {
    const pos = d16FeedbackPositions(prompt, feedback);
    markers.push(...pos.expected.map((p) => mark(p, 'correct')));
    markers.push(...pos.given.map((p) => mark(p, 'wrong', pcAt(p))));
  } else if (guided) {
    // Worked example: the first rep of a new item shows where the note is.
    markers.push(...prompt.targets.map((p) => mark(p, 'target')));
  }

  const visible = compact
    ? d16Window(prompt, {
        reveal: guided || Boolean(feedback),
        size: compactFrets ?? COMPACT_FRETS,
      })
    : REGION;

  const pc = <strong>{prompt.pc}</strong>;
  const first = prompt.targets[0];
  let question;
  if (prompt.source) {
    question = guided ? (
      <>
        The octave of this {pc} is on string {prompt.string}
        {first && <>, fret {first.fret}</>}. Play it to continue.
      </>
    ) : (
      <>
        Play the octave of this {pc} on string {prompt.string}
      </>
    );
  } else {
    question = guided ? (
      <>
        This is {pc} on string {prompt.string}
        {first && <>, fret {first.fret}</>}. Play it to continue.
      </>
    ) : (
      <>
        Play {pc} on string {prompt.string}
      </>
    );
  }

  return (
    <div className={styles.drill} data-size-class={sizeClass} data-mode={prompt.mode}>
      <div className={styles.upper}>
        <div className={styles.top}>
          <p className={styles.prompt} id="drill-prompt" data-testid="d16-prompt">
            {question}
          </p>
          <p className={styles.explain} data-testid="d16-explain">
            {feedback ? d16Explain(prompt, feedback) : d16ModeHint(prompt)}
          </p>
          {!feedback && (
            <MicPanel
              {...mic}
              ringing={mic.ringing && midiToFretNote(mic.ringing.midi, prompt.accidentalPref).pc}
            />
          )}
        </div>
        {sizeClass === 'regular-wide' && aside}
      </div>
      <div className={styles.neckArea}>
        <Fretboard
          tuning={tuning}
          fretRange={visible}
          activeRange={prompt.activeRange}
          handedness={handedness}
          markers={markers}
          guideLevel={d16NeckGuideLevel(prompt, guideLevel, {
            guided,
            answered: Boolean(feedback),
          })}
          blindMode={blindMode}
          accidentalPref={prompt.accidentalPref}
          label={`Fretboard: play ${prompt.pc} on string ${prompt.string}`}
        />
      </div>
      {compact && (
        <p className={styles.windowCaption} data-testid="d16-window">
          Frets {visible.from}–{visible.to}
        </p>
      )}
      {/* iPad portrait: the context panel sits below the neck; compact styles it as a sheet. */}
      {sizeClass !== 'regular-wide' && aside}
    </div>
  );
}

interface MicPanelProps {
  state: PitchSourceState;
  error: PitchSourceError | null;
  /** The note still ringing from before the prompt, by name. */
  ringing: string | null;
  start(): void;
}

function MicPanel({ state, error, ringing, start }: MicPanelProps) {
  if (state === 'running') {
    return (
      <p className={styles.listening} role="status" data-testid="d16-mic" data-state={state}>
        <span className={styles.pulse} aria-hidden="true" />
        {ringing ? `Still hearing ${ringing}. Mute the strings, then play.` : 'Listening…'}
      </p>
    );
  }
  if (state === 'starting') {
    return (
      <p className={styles.status} role="status" data-testid="d16-mic" data-state={state}>
        Starting the microphone…
      </p>
    );
  }
  const reason = state === 'error' ? error?.reason : undefined;
  return (
    <div className={styles.micPanel} data-testid="d16-mic" data-state={state}>
      {reason ? (
        <p className={styles.error} role="alert">
          {ERRORS[reason]}
        </p>
      ) : (
        <p className={styles.status}>
          Play on your guitar. FretFree listens through the microphone and records nothing.
        </p>
      )}
      {reason !== 'unsupported' && (
        <button type="button" className={styles.primary} onClick={start}>
          {reason ? 'Try again' : 'Start listening'}
        </button>
      )}
    </div>
  );
}
