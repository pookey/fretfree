import { useEffect, useId, useRef, useState } from 'react';
import { useAppStore } from '../../app-store';
import { ENGINE_CONFIG } from '../../engine/config';
import type { GuideLevel } from '../../engine/model';
import { TimingCalibration, errorCopy } from '../../timing/TimingCalibration';
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
import type { DrillFeedback, DrillRenderProps } from '../types';
import {
  d20DescribeOffset,
  d20Explain,
  d20Marks,
  type D20Answer,
  type D20Prompt,
  type HitMark,
} from './logic';
import { COUNTS, STEPS_PER_BAR, STEPS_PER_PULSE, strokeAt } from './patterns';
import { runRhythm, type RhythmRun } from './run';
import styles from './D20View.module.css';

const CFG = ENGINE_CONFIG.rhythm;

/** The app's onset source for an input: the e2e fake when switched on, else taps or the mic. */
function defaultSource(kind: OnsetKind): OnsetSource {
  return (
    fakeOnsetsForE2E(kind) ?? (kind === 'tap' ? createToneTapSource() : createMicOnsetSource())
  );
}

function isTapSource(source: OnsetSource): source is TapSource {
  return 'attach' in source;
}

/** `done`: answered, until the feedback (or the next prompt) arrives; nothing to start meanwhile. */
type Phase =
  | { name: 'ready' }
  | { name: 'running' }
  | { name: 'done' }
  | { name: 'error'; reason: OnsetSourceErrorReason };

/** Where the click is: a count-in beat (1–4), or a step of the rhythm. */
type Position = { countIn: number } | { bar: number; step: number } | null;

function positionOf(click: Click): Position {
  if (click.countIn) return { countIn: Math.floor(click.pulseInBar) + 1 };
  return { bar: click.bar, step: Math.round(click.pulseInBar * STEPS_PER_PULSE) };
}

export interface RhythmDrillProps extends DrillRenderProps<D20Prompt, D20Answer> {
  /** For tests. */
  metronome?: Metronome;
  createSource?: (kind: OnsetKind) => OnsetSource;
}

/** D20's render: the view with the app's metronome and inputs. */
export function D20View(props: DrillRenderProps<D20Prompt, D20Answer>) {
  return <RhythmDrill {...props} />;
}

/**
 * D20 "Tap and strum rhythm" (design §6, §12): the rhythm on a one-bar grid,
 * a bar of count-in, then the rhythm twice through on the pad, or strummed
 * on a guitar in mic mode. The click, the inputs and the grade are the
 * timing engine's (M8-01).
 *
 * Guides fade with the level (rule 9): the light that steps along the
 * rhythm and the "&" click from `playheadGuideLevel` and
 * `subdivideGuideLevel`, the counts under the grid from `countGuideLevel`.
 * The worked example (the first rep) has them all.
 */
export function RhythmDrill({
  prompt,
  guideLevel,
  guided,
  sizeClass,
  feedback,
  onAnswer,
  aside,
  metronome = getMetronome(),
  createSource = defaultSource,
}: RhythmDrillProps) {
  const level: GuideLevel = guided ? 3 : guideLevel;
  const micEnabled = useAppStore((s) => s.settings.micEnabled);
  const offsets = useAppStore((s) => s.settings.timingOffsets);
  const [phase, setPhase] = useState<Phase>({ name: 'ready' });
  const [input, setInput] = useState<OnsetKind>(() =>
    micEnabled && prompt.kind === 'strum' ? 'mic' : 'tap',
  );
  const [calibrating, setCalibrating] = useState(false);
  const [source, setSource] = useState<OnsetSource | null>(null);
  const [position, setPosition] = useState<Position>(null);
  const [beat, setBeat] = useState<Click | null>(null);
  const run = useRef<RhythmRun | null>(null);
  const pad = useRef<HTMLButtonElement>(null);
  const inputName = useId();

  // A new prompt starts ready; a rep still running for the last one is dropped.
  const [pinned, setPinned] = useState(prompt);
  if (pinned !== prompt) {
    setPinned(prompt);
    setPhase({ name: 'ready' });
    setPosition(null);
  }
  useEffect(
    () => () => {
      run.current?.cancel();
      run.current = null;
    },
    [prompt],
  );

  // The light and the playhead follow the click, on the frame it sounds.
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
    const r = runRhythm(
      {
        metronome,
        source: next,
        // Read per onset, so a recalibration counts at once.
        compensation: () =>
          liveCompensation(next.kind, useAppStore.getState().settings.timingOffsets),
      },
      {
        bpm: prompt.bpm,
        countInBars: prompt.countInBars,
        bars: prompt.bars,
        pulses: prompt.pulses,
        subdivided: prompt.offbeats && level >= CFG.subdivideGuideLevel,
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
        onAnswer({ input: next.kind, ...take });
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
  const verb = strum ? 'Strum' : 'Tap';
  const counting = running && position !== null && 'countIn' in position;
  const idle = (phase.name === 'ready' || phase.name === 'error') && !feedback;

  return (
    <div className={styles.drill} data-size-class={sizeClass} data-phase={phase.name}>
      <div className={styles.upper}>
        <div className={styles.top}>
          <p className={styles.prompt} id="drill-prompt" data-testid="d20-prompt">
            {verb} <strong>{prompt.name}</strong>
            <span className={styles.tempo}> at {prompt.bpm} BPM</span>
          </p>
          <p className={styles.explain} data-testid="d20-explain">
            {feedback
              ? d20Explain(prompt, feedback)
              : guided
                ? `Listen to the count-in, then ${verb.toLowerCase()} the rhythm twice through. The light shows where you are.`
                : prompt.hint}
          </p>
          {feedback ? (
            <ResultGrid prompt={prompt} feedback={feedback} />
          ) : (
            <PatternGrid
              prompt={prompt}
              counts={level >= CFG.countGuideLevel}
              playhead={
                level >= CFG.playheadGuideLevel && position && 'step' in position
                  ? position.step
                  : null
              }
            />
          )}
          {idle && micEnabled && (
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
                  {kind === 'tap' ? 'Tapping' : 'Strumming a guitar'}
                </label>
              ))}
            </fieldset>
          )}
          {idle && strum && (
            <p className={styles.note}>
              Use headphones, so the microphone hears your guitar and not the click. Mute the
              strings with your fretting hand for a clean, short strum.
            </p>
          )}
          {idle && (calibrating || offsets[input] === null) && (
            <div className={styles.calibrate} data-testid="d20-calibrate">
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

      {!feedback && !calibrating && phase.name !== 'done' && (
        <div className={styles.play}>
          <div className={styles.status} aria-live="polite" data-testid="d20-status">
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
              <span className={styles.light} data-on={beat !== null} data-accent={beat?.accent} />
              <span aria-hidden="true">
                {counting && 'countIn' in position ? position.countIn : 'Tap'}
              </span>
            </button>
          )}
          {running && input === 'mic' && (
            <div className={styles.pad} role="img" aria-label="Listening for your guitar">
              <span className={styles.light} data-on={beat !== null} data-accent={beat?.accent} />
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
      {/* iPad portrait: the context panel sits below; compact styles it as a sheet. */}
      {sizeClass !== 'regular-wide' && aside}
    </div>
  );
}

interface PatternGridProps {
  prompt: D20Prompt;
  /** Show "1 & 2 &" under the steps. */
  counts: boolean;
  /** The step the click is on, lit; `null` for none. */
  playhead: number | null;
}

function stepLabel(prompt: D20Prompt, step: number): string {
  const count = countOf(step);
  if (!prompt.hits.includes(step)) return `${count}: rest`;
  return prompt.kind === 'strum' ? `${count}: ${strokeAt(step)} strum` : `${count}: tap`;
}

/** One bar of the rhythm: a box per eighth, filled where it is played. */
function PatternGrid({ prompt, counts, playhead }: PatternGridProps) {
  return (
    <ol className={styles.grid} aria-label="The rhythm, one bar" data-testid="d20-grid">
      {Array.from({ length: STEPS_PER_BAR }, (_, step) => {
        const hit = prompt.hits.includes(step);
        return (
          <li
            key={step}
            className={styles.cell}
            data-hit={hit}
            data-beat={step % STEPS_PER_PULSE === 0}
            aria-current={playhead === step ? 'step' : undefined}
            aria-label={stepLabel(prompt, step)}
          >
            <span className={styles.box} aria-hidden="true">
              {hit && prompt.kind === 'strum' ? (strokeAt(step) === 'down' ? '↓' : '↑') : ''}
            </span>
            {counts && (
              <span className={styles.count} aria-hidden="true">
                {COUNTS[step]}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

const VERDICT: Record<HitMark['verdict'], { symbol: string; text: (ms: number) => string }> = {
  on: { symbol: '●', text: (ms) => `on time, ${d20DescribeOffset(ms)}` },
  early: { symbol: '◀', text: (ms) => `too early, ${d20DescribeOffset(ms)}` },
  late: { symbol: '▶', text: (ms) => `too late, ${d20DescribeOffset(ms)}` },
  miss: { symbol: '✕', text: () => 'missed' },
};

function countOf(step: number): string {
  return `${COUNTS[step]}${step % STEPS_PER_PULSE ? ` of ${COUNTS[step - 1]}` : ''}`;
}

/** Every bar as played: each hit marked on time, early, late or missed, by shape and colour. */
function ResultGrid({
  prompt,
  feedback,
}: {
  prompt: D20Prompt;
  feedback: DrillFeedback<D20Answer>;
}) {
  const marks = d20Marks(prompt, feedback.answer);
  return (
    <div className={styles.results} data-testid="d20-results">
      {Array.from({ length: prompt.bars }, (_, bar) => (
        <ol key={bar} className={styles.grid} aria-label={`Bar ${bar + 1}`}>
          {Array.from({ length: STEPS_PER_BAR }, (_, step) => {
            const mark = marks.find((m) => m.bar === bar && m.step === step);
            const count = countOf(step);
            return (
              <li
                key={step}
                className={styles.cell}
                data-hit={Boolean(mark)}
                data-beat={step % STEPS_PER_PULSE === 0}
                data-verdict={mark?.verdict}
                aria-label={
                  mark
                    ? `${count}: ${VERDICT[mark.verdict].text(mark.offsetMs ?? 0)}`
                    : `${count}: rest`
                }
              >
                <span className={styles.box} aria-hidden="true">
                  {mark && VERDICT[mark.verdict].symbol}
                </span>
                <span className={styles.count} aria-hidden="true">
                  {COUNTS[step]}
                </span>
              </li>
            );
          })}
        </ol>
      ))}
    </div>
  );
}
