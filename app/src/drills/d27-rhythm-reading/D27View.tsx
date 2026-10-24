import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useAppStore } from '../../app-store';
import { Staff, type StaffNote, type StaffNoteStyle } from '../../components/staff';
import { ENGINE_CONFIG } from '../../engine/config';
import type { GuideLevel } from '../../engine/model';
import { clickMeter, durationCode, type RhythmEvent } from '../../theory';
import { TimingCalibration, errorCopy } from '../../timing/TimingCalibration';
import { TimingWindowSelect } from '../../timing/TimingWindowSelect';
import { createToneTapSource, liveCompensation } from '../../timing/device';
import { fakeOnsetsForE2E } from '../../timing/e2e-hook';
import type { OnsetKind } from '../../timing/latency';
import { createMicOnsetSource } from '../../timing/mic-onsets';
import { getMetronome, type Click, type Metronome } from '../../timing/metronome';
import {
  OnsetSourceError,
  type OnsetSource,
  type OnsetSourceErrorReason,
  type TapSource,
} from '../../timing/onsets';
import type { DrillRenderProps } from '../types';
import {
  d27DescribeOffset,
  d27Events,
  d27Explain,
  d27HearPlan,
  d27MarkX,
  d27Marks,
  d27Syllables,
  signatureOf,
  type D27Answer,
  type D27Prompt,
  type NoteMark,
} from './logic';
import { markHeard } from './heard';
import { hearOptions, runReading, type ReadingRun } from './run';
import { eventAtPulse, spokenMeter, staffTuplets } from './staff';
import styles from './D27View.module.css';

const CFG = ENGINE_CONFIG.rhythmReading;

/** Rhythm is drawn on the middle line: B3 sounds as the 8vb clef's written B4. */
const LINE_PITCH = ['B3'];

/** The app's onset source for an input: the e2e fake when switched on, else taps or the mic. */
function defaultSource(kind: OnsetKind): OnsetSource {
  return (
    fakeOnsetsForE2E(kind) ?? (kind === 'tap' ? createToneTapSource() : createMicOnsetSource())
  );
}

function isTapSource(source: OnsetSource): source is TapSource {
  return 'attach' in source;
}

/**
 * `listen`: a first exposure, the notation hidden until the bar is heard.
 * `done`: answered, until the feedback (or the next prompt) arrives.
 */
type Phase =
  | { name: 'listen' }
  | { name: 'ready' }
  | { name: 'running' }
  | { name: 'done' }
  | { name: 'error'; reason: OnsetSourceErrorReason };

/** Where the click is: a count-in beat, or a pulse of the bar. */
type Position = { countIn: number } | { pulse: number } | null;

function positionOf(click: Click): Position {
  if (click.countIn) return { countIn: Math.floor(click.pulseInBar) + 1 };
  return { pulse: click.pulseInBar };
}

function staffNotes(bar: readonly RhythmEvent[], styleOf: (i: number) => StaffNoteStyle) {
  return bar.map((e, i): StaffNote => ({
    pitches: e.rest ? [] : LINE_PITCH,
    value: durationCode(e.value) as StaffNote['value'],
    dots: e.dots ?? 0,
    tie: Boolean(e.tie && !e.rest),
    style: e.rest ? 'plain' : styleOf(i),
  }));
}

/** Each note's style in feedback: right only when every time through it was on time. */
function feedbackStyles(marks: readonly NoteMark[]): Map<number, StaffNoteStyle> {
  const out = new Map<number, StaffNoteStyle>();
  for (const m of marks) {
    if (m.verdict !== 'on') out.set(m.event, 'wrong');
    else if (!out.has(m.event)) out.set(m.event, 'correct');
  }
  return out;
}

export interface ReadingDrillProps extends DrillRenderProps<D27Prompt, D27Answer> {
  /** For tests. */
  metronome?: Metronome;
  createSource?: (kind: OnsetKind) => OnsetSource;
}

/** D27's render: the view with the app's metronome and inputs. */
export function D27View(props: DrillRenderProps<D27Prompt, D27Answer>) {
  return <ReadingDrill {...props} />;
}

/**
 * D27 "Rhythm reading" (design §6, §12): a bar on the staff with the card's
 * rhythm cell in it; a bar of count-in, then the bar twice through on the
 * pad, or played on a guitar in mic mode. The click, the inputs and the
 * grade are the timing engine's (M8-01).
 *
 * **Sound before symbol:** a cell's first rep (the worked example) opens
 * with the notation hidden, and plays the bar on the click; the staff shows
 * once it has been heard. Feedback can play it again (rule 10).
 *
 * Guides fade with the level (rule 9): the count under the notes from
 * `countGuideLevel`, the cell's notes ringed and a caret that follows the
 * click from `playheadGuideLevel`, and the subdivided click from
 * `subdivideGuideLevel`. The worked example has them all.
 */
export function ReadingDrill({
  prompt,
  guideLevel,
  guided,
  sizeClass,
  feedback,
  onAnswer,
  aside,
  metronome = getMetronome(),
  createSource = defaultSource,
}: ReadingDrillProps) {
  const level: GuideLevel = guided ? 3 : guideLevel;
  const micEnabled = useAppStore((s) => s.settings.micEnabled);
  const offsets = useAppStore((s) => s.settings.timingOffsets);
  const first: Phase = guided ? { name: 'listen' } : { name: 'ready' };
  const [phase, setPhase] = useState<Phase>(first);
  const [input, setInput] = useState<OnsetKind>('tap');
  const [calibrating, setCalibrating] = useState(false);
  const [source, setSource] = useState<OnsetSource | null>(null);
  const [position, setPosition] = useState<Position>(null);
  const [beat, setBeat] = useState<Click | null>(null);
  const run = useRef<ReadingRun | null>(null);
  const pad = useRef<HTMLButtonElement>(null);
  const inputName = useId();

  // A new prompt starts afresh; a rep still running for the last one is dropped.
  const [pinned, setPinned] = useState(prompt);
  if (pinned !== prompt) {
    setPinned(prompt);
    setPhase(first);
    setPosition(null);
  }
  useEffect(
    () => () => {
      run.current?.cancel();
      run.current = null;
    },
    [prompt],
  );

  const events = useMemo(() => d27Events(prompt), [prompt]);
  const syllables = useMemo(() => d27Syllables(prompt), [prompt]);
  const tuplets = useMemo(() => staffTuplets(events), [events]);
  const meter = useMemo(() => clickMeter(signatureOf(prompt.meter)), [prompt.meter]);

  // The light and the caret follow the click, on the frame it sounds.
  const running = phase.name === 'running';
  useEffect(() => {
    if (!running) return;
    let off: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = metronome.onBeat((click) => {
      setPosition(positionOf(click));
      if (!click.audible) return;
      setBeat(click);
      clearTimeout(off);
      off = setTimeout(() => setBeat(null), 100);
    });
    return () => {
      unsubscribe();
      clearTimeout(off);
      setBeat(null);
    };
  }, [running, metronome]);

  // Taps count from the pad; it takes focus so Space works at once.
  useEffect(() => {
    const el = pad.current;
    if (!el || !source) return;
    el.focus();
    if (isTapSource(source)) return source.attach(el);
  }, [source]);

  const start = () => {
    const next = createSource(input);
    setSource(next);
    const r = runReading(
      {
        metronome,
        source: next,
        // Read per onset, so a recalibration counts at once.
        compensation: () =>
          liveCompensation(next.kind, useAppStore.getState().settings.timingOffsets),
      },
      {
        meter,
        bpm: prompt.bpm,
        subdivide: prompt.subdivide,
        countInBars: prompt.countInBars,
        bars: prompt.bars,
        pulses: prompt.pulses,
        alsoPulses: prompt.partnerPulses ?? [],
        subdivided: level >= CFG.subdivideGuideLevel,
        settleMs: CFG.grade.matchMs + CFG.endMarginMs,
      },
    );
    run.current = r;
    setPosition(null);
    setPhase({ name: 'running' });
    r.done.then(
      (take) => {
        if (run.current !== r) return;
        run.current = null;
        setSource(null);
        setPosition(null);
        if (!take) {
          // Cancelled goes back to the start; an input lost mid-rep says so.
          const lost = next.state === 'error' ? next.error : null;
          return setPhase(lost ? { name: 'error', reason: lost.reason } : { name: 'ready' });
        }
        setPhase({ name: 'done' });
        onAnswer({
          input: next.kind,
          targetsMs: take.targetsMs,
          partnerTargetsMs: take.alsoMs,
          onsetsMs: take.onsetsMs,
          window: useAppStore.getState().settings.timingWindow,
        });
      },
      (err: unknown) => {
        if (run.current !== r) return;
        run.current = null;
        setSource(null);
        setPhase({
          name: 'error',
          reason: err instanceof OnsetSourceError ? err.reason : 'failed',
        });
      },
    );
  };

  const cancel = () => run.current?.cancel();

  const strum = input === 'mic';
  const verb = strum ? 'Play' : 'Tap';
  const counting = running && position !== null && 'countIn' in position;
  const listening = phase.name === 'listen';
  const idle = (phase.name === 'ready' || phase.name === 'error') && !feedback;
  const caret =
    running && level >= CFG.playheadGuideLevel && position && 'pulse' in position
      ? eventAtPulse(events, prompt.meter, position.pulse)
      : undefined;

  const marks = feedback ? d27Marks(prompt, feedback.answer) : [];
  const shown = feedbackStyles(marks);
  const cellEvents = new Set(prompt.cellEvents);
  const notes = staffNotes(events, (i) => {
    if (feedback) return shown.get(i) ?? 'plain';
    return level >= CFG.playheadGuideLevel && cellEvents.has(i) ? 'target' : 'plain';
  });

  let explain: string;
  if (feedback) explain = d27Explain(prompt, feedback);
  else if (listening)
    explain = 'Listen first: hear how it goes, then read it and tap it twice through.';
  else if (guided)
    explain = `Now read it. Listen to the count-in, then ${verb.toLowerCase()} the bar twice through.`;
  else explain = `Read the bar, then ${verb.toLowerCase()} it twice through after the count-in.`;

  return (
    <div className={styles.drill} data-size-class={sizeClass} data-phase={phase.name}>
      <div className={styles.upper}>
        <div className={styles.top}>
          <p className={styles.prompt} id="drill-prompt" data-testid="d27-prompt">
            {verb} <strong>{prompt.name.toLowerCase()}</strong>
            <span className={styles.tempo}>
              {' '}
              in {prompt.meter} at {prompt.bpm} BPM
            </span>
          </p>
          <p className={styles.explain} data-testid="d27-explain">
            {explain}
          </p>

          {listening ? (
            <div className={styles.listen} data-testid="d27-listen">
              <p className={styles.hidden}>The notation shows once you’ve heard it.</p>
              <HearButton
                prompt={prompt}
                metronome={metronome}
                label="Hear the rhythm"
                primary
                onHeard={() => {
                  markHeard(prompt);
                  setPhase({ name: 'ready' });
                }}
              />
            </div>
          ) : (
            <div className={styles.reading}>
              <div className={styles.staffScroll}>
                <Staff
                  notes={notes}
                  tuplets={tuplets}
                  timeSignature={prompt.meter}
                  revealPitches={false}
                  cursor={caret}
                  label={`The bar to read, in ${spokenMeter(prompt.meter)}`}
                  className={styles.staff}
                />
              </div>
              {level >= CFG.countGuideLevel && !feedback && (
                <ol className={styles.counts} aria-label="How to count it">
                  {events.map((e, i) => (
                    <li
                      key={i}
                      data-testid="d27-count"
                      data-rest={e.rest || undefined}
                      data-cell={cellEvents.has(i) || undefined}
                    >
                      {e.rest ? `(${syllables[i] || '–'})` : syllables[i] || '·'}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}

          {feedback && (
            <>
              <ResultRows prompt={prompt} marks={marks} />
              <HearButton prompt={prompt} metronome={metronome} label="Hear the bar" />
              {!feedback.result.correct && <WindowNote />}
            </>
          )}

          {(idle || listening) && micEnabled && (
            <fieldset className={styles.inputs}>
              <legend>Play by</legend>
              {(['tap', 'mic'] as const).map((kind) => (
                <label key={kind}>
                  <input
                    type="radio"
                    name={inputName}
                    value={kind}
                    checked={input === kind}
                    onChange={() => {
                      setInput(kind);
                      setCalibrating(false);
                    }}
                  />
                  {kind === 'tap' ? 'Tapping' : 'Playing a guitar'}
                </label>
              ))}
            </fieldset>
          )}

          {/* Start sits under the bar, in the prompt column, so a phone on its side shows it. */}
          {!feedback && !calibrating && !listening && phase.name !== 'done' && (
            <div className={styles.play}>
              <div className={styles.status} aria-live="polite" data-testid="d27-status">
                {phase.name === 'error' && (
                  <p className={styles.error} role="alert">
                    {errorCopy(input, phase.reason)}
                  </p>
                )}
                {running && <p>{counting || position === null ? 'Count-in: listen…' : 'Go!'}</p>}
              </div>
              {running && input === 'tap' && (
                <button
                  ref={pad}
                  type="button"
                  className={styles.pad}
                  aria-label="Tap the rhythm"
                  aria-describedby="drill-prompt"
                >
                  <span
                    className={styles.light}
                    data-on={beat !== null}
                    data-accent={beat?.accent}
                  />
                  <span aria-hidden="true">
                    {counting && 'countIn' in position ? position.countIn : 'Tap'}
                  </span>
                </button>
              )}
              {running && input === 'mic' && (
                <div className={styles.pad} role="img" aria-label="Listening for your guitar">
                  <span
                    className={styles.light}
                    data-on={beat !== null}
                    data-accent={beat?.accent}
                  />
                  <span aria-hidden="true">
                    {counting && 'countIn' in position ? position.countIn : 'Listening…'}
                  </span>
                </div>
              )}
              <div className={styles.actions}>
                {running ? (
                  <button type="button" className={styles.button} onClick={cancel}>
                    Stop
                  </button>
                ) : (
                  <button type="button" className={styles.primary} onClick={start}>
                    {phase.name === 'error' ? 'Try again' : 'Start'}
                  </button>
                )}
              </div>
            </div>
          )}
          {idle && strum && (
            <p className={styles.note}>
              Use headphones, so the microphone hears your guitar and not the click. Mute the
              strings with your fretting hand and pick or strum each note short.
            </p>
          )}
          {idle && (calibrating || offsets[input] === null) && (
            <div className={styles.calibrate} data-testid="d27-calibrate">
              {calibrating ? (
                <TimingCalibration kind={input} onDone={() => setCalibrating(false)} />
              ) : (
                <p className={styles.note}>
                  Your {strum ? 'guitar' : 'tap'} timing hasn’t been checked on this device.{' '}
                  <button
                    type="button"
                    className={styles.link}
                    onClick={() => setCalibrating(true)}
                  >
                    Check it (10 seconds)
                  </button>{' '}
                  so a slow screen or speaker doesn’t count against you.
                </p>
              )}
            </div>
          )}
        </div>
        {sizeClass === 'regular-wide' && aside}
      </div>

      {/* iPad portrait: the context panel sits below; compact styles it as a sheet. */}
      {sizeClass !== 'regular-wide' && aside}
    </div>
  );
}

interface HearButtonProps {
  prompt: D27Prompt;
  metronome: Metronome;
  label: string;
  primary?: boolean;
  /** The bar played through to its end (not stopped part-way). */
  onHeard?: () => void;
}

/**
 * Plays the bar on the timing engine's click, at the rep's tempo: a bar of
 * beats to count in, then a click on each note (sound before symbol, design
 * §12; research/02 rule 10). A second tap stops it, as does the next card.
 */
function HearButton({ prompt, metronome, label, primary = false, onHeard }: HearButtonProps) {
  const [playing, setPlaying] = useState(false);
  const playingRef = useRef(false);
  const heard = useRef(onHeard);
  useEffect(() => {
    heard.current = onHeard;
  });

  useEffect(() => {
    playingRef.current = playing;
    if (!playing) return;
    const { endPulse } = d27HearPlan(prompt);
    let reached = false;
    const offBeat = metronome.onBeat((click) => {
      if (!click.countIn && click.pulse >= endPulse) {
        reached = true;
        metronome.stop();
      }
    });
    const offStop = metronome.onStop(() => {
      setPlaying(false);
      if (reached) heard.current?.();
    });
    return () => {
      offBeat();
      offStop();
    };
  }, [playing, metronome, prompt]);

  useEffect(
    () => () => {
      if (playingRef.current) metronome.stop();
    },
    [metronome],
  );

  const hear = async () => {
    if (playing) {
      metronome.stop();
      return;
    }
    setPlaying(true);
    const { steps } = d27HearPlan(prompt);
    const options = hearOptions(
      clickMeter(signatureOf(prompt.meter)),
      prompt.bpm,
      prompt.subdivide,
      steps,
    );
    if (!(await metronome.start(options))) setPlaying(false);
  };

  return (
    <button
      type="button"
      className={primary && !playing ? styles.primary : styles.button}
      onClick={() => void hear()}
      aria-pressed={playing}
      data-testid="d27-hear"
    >
      {playing ? 'Stop' : label}
    </button>
  );
}

/**
 * After a failed rep: how wide the timing window is, and the setting to widen
 * it in place, for a learner whose screen or speaker is slower than their ear.
 */
function WindowNote() {
  const chosen = useAppStore((s) => s.settings.timingWindow);
  const hint = useId();
  const { onTimeMs } = ENGINE_CONFIG.rhythm.windows[chosen];
  return (
    <div className={styles.window} data-testid="d27-window">
      <label className={styles.windowRow}>
        Rhythm timing
        <TimingWindowSelect className={styles.select} aria-describedby={hint} />
      </label>
      <p id={hint} className={styles.note}>
        {chosen === 'relaxed'
          ? `Taps count within ${onTimeMs} ms of the note, the widest window. If every tap lands late, check your tap timing in Settings.`
          : `Taps count within ${onTimeMs} ms of the note. If you’re in time but it doesn’t count, widen it for your next reps. It’s also in Settings.`}
      </p>
    </div>
  );
}

const VERDICT: Record<NoteMark['verdict'], (ms: number) => string> = {
  on: (ms) => `on time, ${d27DescribeOffset(ms)}`,
  early: (ms) => `too early, ${d27DescribeOffset(ms)}`,
  late: (ms) => `too late, ${d27DescribeOffset(ms)}`,
  miss: () => 'missed',
};

/**
 * One note as played, inside its box: a line for the note and a dot where the
 * tap landed, left of the line when early and right when late, with a tail
 * back to the line when it was off. A miss is a cross. Position and shape
 * carry the verdict, not colour alone.
 */
function TapMarker({ mark }: { mark: NoteMark }) {
  if (mark.offsetMs === null) return <span>✕</span>;
  const x = d27MarkX(mark.offsetMs);
  const style = {
    '--x': x,
    '--tail-from': Math.min(0, x),
    '--tail-len': Math.abs(x),
  } as CSSProperties;
  return (
    <span className={styles.marker} style={style} data-side={x < 0 ? 'early' : 'late'}>
      <span className={styles.line} />
      {mark.verdict !== 'on' && <span className={styles.tail} />}
      <span className={styles.hit} />
    </span>
  );
}

/** Every time through the bar: each note marked on time, early, late or missed. */
function ResultRows({ prompt, marks }: { prompt: D27Prompt; marks: readonly NoteMark[] }) {
  return (
    <div className={styles.results} data-testid="d27-results">
      {Array.from({ length: prompt.bars }, (_, pass) => (
        <ol key={pass} className={styles.row} aria-label={`Time ${pass + 1}`}>
          {marks
            .filter((m) => m.pass === pass)
            .map((m, i) => (
              <li
                key={i}
                className={styles.mark}
                data-verdict={m.verdict}
                aria-label={`${m.syllable || 'note'}: ${VERDICT[m.verdict](m.offsetMs ?? 0)}`}
              >
                <span className={styles.box} aria-hidden="true">
                  <TapMarker mark={m} />
                </span>
                <span className={styles.syllable} aria-hidden="true">
                  {m.syllable || '·'}
                </span>
              </li>
            ))}
        </ol>
      ))}
      <p className={styles.key}>
        The line is the note and the dot is your tap: left of the line is early, right is late.
      </p>
    </div>
  );
}
