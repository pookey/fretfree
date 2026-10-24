import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { useAppStore } from '../../app-store';
import { ENGINE_CONFIG } from '../../engine/config';
import type { GuideLevel } from '../../engine/model';
import { TimingCalibration, errorCopy } from '../../timing/TimingCalibration';
import { TimingWindowSelect } from '../../timing/TimingWindowSelect';
import { createToneClock, liveCompensation } from '../../timing/device';
import { fakeOnsetsForE2E } from '../../timing/e2e-hook';
import type { OnsetKind } from '../../timing/latency';
import { createMicOnsetSource } from '../../timing/mic-onsets';
import { getMetronome, type Click, type Metronome } from '../../timing/metronome';
import {
  OnsetSourceError,
  type OnsetSource,
  type OnsetSourceErrorReason,
} from '../../timing/onsets';
import type { DrillFeedback, DrillRenderProps } from '../types';
import {
  d31BarClickLine,
  d31ClickLine,
  d31DescribeOffset,
  d31Explain,
  d31Marks,
  d31RightRate,
  d31Score,
  d31StartRung,
  type D31Answer,
  type D31Prompt,
  type StrokeMark,
} from './logic';
import { runAccents, type AccentRun } from './run';
import { createAccentTapSource, isAccentTapSource } from './taps';
import styles from './D31View.module.css';

const CFG = ENGINE_CONFIG.accentStrum;

/** The app's onset source for an input: the e2e fake when switched on, else the pads or the mic. */
function defaultSource(kind: OnsetKind): OnsetSource {
  return (
    fakeOnsetsForE2E(kind) ??
    (kind === 'tap' ? createAccentTapSource(createToneClock()) : createMicOnsetSource())
  );
}

/** `done`: answered, until the feedback (or the next prompt) arrives; nothing to start meanwhile. */
type Phase =
  | { name: 'ready' }
  | { name: 'running' }
  | { name: 'done' }
  | { name: 'error'; reason: OnsetSourceErrorReason };

/** Where the click is: a count-in beat, or a step of a bar. */
type Position = { countIn: number } | { bar: number; step: number } | null;

function positionOf(click: Click, stepsPerPulse: number): Position {
  if (click.countIn) return { countIn: Math.floor(click.pulseInBar) + 1 };
  return { bar: click.bar, step: Math.round(click.pulseInBar * stepsPerPulse) };
}

const UNIT: Record<number, { glyph: string; name: string }> = {
  2: { glyph: '𝅗𝅥', name: 'half notes' },
  4: { glyph: '♩', name: 'quarter notes' },
  8: { glyph: '♪', name: 'eighth notes' },
  16: { glyph: '𝅘𝅥𝅯', name: 'sixteenth notes' },
};

export interface AccentDrillProps extends DrillRenderProps<D31Prompt, D31Answer> {
  /** For tests. */
  metronome?: Metronome;
  createSource?: (kind: OnsetKind) => OnsetSource;
}

/** D31's render: the view with the app's metronome and inputs. */
export function D31View(props: DrillRenderProps<D31Prompt, D31Answer>) {
  return <AccentDrill {...props} />;
}

/**
 * D31 "Accent and strum in meter" (design §6, §12): a bar with its accents
 * marked, a bar of count-in, then the bar four times through on two pads
 * (strong and soft), or strummed on a guitar in mic mode. The click fades
 * bar by bar while the strokes are right, and comes back when they slip.
 *
 * Guides fade with the level (rule 9): the count under the bar and the light
 * that steps along it show at high levels (`syllableGuideLevel`,
 * `playheadGuideLevel`), and the click starts further up its fade ladder as
 * the level drops (`startRung`). The worked example has every guide and the
 * whole click.
 */
export function AccentDrill({
  prompt,
  guideLevel,
  guided,
  sizeClass,
  feedback,
  onAnswer,
  aside,
  metronome = getMetronome(),
  createSource = defaultSource,
}: AccentDrillProps) {
  const level: GuideLevel = guided ? 3 : guideLevel;
  const startRung = d31StartRung(level, prompt.ladder.length);
  const micEnabled = useAppStore((s) => s.settings.micEnabled);
  const offsets = useAppStore((s) => s.settings.timingOffsets);
  const [phase, setPhase] = useState<Phase>({ name: 'ready' });
  const [input, setInput] = useState<OnsetKind>(() => (micEnabled && prompt.strum ? 'mic' : 'tap'));
  const [calibrating, setCalibrating] = useState(false);
  const [source, setSource] = useState<OnsetSource | null>(null);
  const [position, setPosition] = useState<Position>(null);
  const [rung, setRung] = useState(startRung);
  const [beat, setBeat] = useState<Click | null>(null);
  const run = useRef<AccentRun | null>(null);
  const pads = useRef<HTMLDivElement>(null);
  const strongPad = useRef<HTMLButtonElement>(null);
  const softPad = useRef<HTMLButtonElement>(null);
  const inputName = useId();

  // A new prompt starts ready; a rep still running for the last one is dropped.
  const [pinned, setPinned] = useState(prompt);
  if (pinned !== prompt) {
    setPinned(prompt);
    setPhase({ name: 'ready' });
    setPosition(null);
    setRung(startRung);
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
      setPosition(positionOf(click, prompt.stepsPerPulse));
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
  }, [running, metronome, prompt.stepsPerPulse]);

  // Taps count from the pads; the strong pad takes focus so the keys work at once.
  useEffect(() => {
    if (!source || !pads.current || !strongPad.current || !softPad.current) return;
    strongPad.current.focus();
    if (isAccentTapSource(source))
      return source.attach({
        strong: strongPad.current,
        soft: softPad.current,
        keys: pads.current,
      });
  }, [source]);

  const start = () => {
    const next = createSource(input);
    setSource(next);
    setRung(startRung);
    const window = () => useAppStore.getState().settings.timingWindow;
    const r = runAccents(
      {
        metronome,
        source: next,
        // Read per onset, so a recalibration counts at once.
        compensation: () =>
          liveCompensation(next.kind, useAppStore.getState().settings.timingOffsets),
      },
      {
        meter: prompt.click,
        stepsPerPulse: prompt.stepsPerPulse,
        bpm: prompt.bpm,
        countInBars: prompt.countInBars,
        bars: prompt.bars,
        pulses: prompt.pulses,
        ladder: prompt.ladder,
        startRung,
        rateBar: (bar, targets, onsets) => {
          const n = prompt.hits.length;
          const accented = prompt.accented.slice(bar * n, (bar + 1) * n);
          return d31RightRate(d31Score(next.kind, window(), targets, accented, onsets));
        },
        onBar: (_bar, barRung) => setRung(barRung),
        settleMs: ENGINE_CONFIG.timing.grade.matchMs + CFG.endMarginMs,
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
          setRung(startRung);
          return setPhase(lost ? { name: 'error', reason: lost.reason } : { name: 'ready' });
        }
        setPhase({ name: 'done' });
        onAnswer({ input: next.kind, ...take, window: window() });
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
  const verb = prompt.kind === 'count' ? 'Count' : prompt.strum ? 'Play' : strum ? 'Strum' : 'Tap';
  const counting = running && position !== null && 'countIn' in position;
  const idle = (phase.name === 'ready' || phase.name === 'error') && !feedback;
  const unit = UNIT[prompt.click.unit] ?? UNIT[4]!;

  return (
    <div className={styles.drill} data-size-class={sizeClass} data-phase={phase.name}>
      <div className={styles.upper}>
        <div className={styles.top}>
          <p className={styles.prompt} id="drill-prompt" data-testid="d31-prompt">
            {verb} <strong>{prompt.name}</strong>
            <span className={styles.tempo}>
              {' '}
              <span aria-hidden="true">
                at {unit.glyph} = {prompt.bpm}
              </span>
              <span className="visually-hidden">
                at {prompt.bpm} {unit.name} a minute
              </span>
            </span>
          </p>
          <p className={styles.explain} data-testid="d31-explain">
            {feedback
              ? d31Explain(prompt, feedback)
              : guided
                ? `Listen to the count-in, then play the bar ${prompt.bars} times. Strong on the marked strokes, soft on the rest. The click fades while you keep time.`
                : prompt.hint}
          </p>
          {feedback ? (
            <>
              <ResultGrid prompt={prompt} feedback={feedback} />
              {!feedback.result.correct && <WindowNote />}
            </>
          ) : (
            <BarGrid
              prompt={prompt}
              syllables={level >= CFG.syllableGuideLevel}
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
          {!feedback && !calibrating && phase.name !== 'done' && (
            <div className={styles.play}>
              <div className={styles.status} aria-live="polite" data-testid="d31-status">
                {phase.name === 'error' && (
                  <p className={styles.error} role="alert">
                    {errorCopy(input, phase.reason)}
                  </p>
                )}
                {running && <p>{counting || position === null ? 'Count-in: listen…' : 'Go!'}</p>}
              </div>
              <p className={styles.click} data-testid="d31-click">
                {d31ClickLine(prompt, rung)}
              </p>
              {running && input === 'tap' && (
                <div
                  ref={pads}
                  className={styles.pads}
                  role="group"
                  aria-label="Tap pads"
                  aria-describedby="drill-prompt"
                >
                  <button
                    ref={strongPad}
                    type="button"
                    className={styles.pad}
                    data-strength="strong"
                    aria-label="Strong"
                  >
                    <span
                      className={styles.light}
                      data-on={beat !== null}
                      data-accent={beat?.accent}
                    />
                    <span aria-hidden="true">
                      {counting && 'countIn' in position ? position.countIn : 'Strong'}
                    </span>
                    <span className={styles.keys} aria-hidden="true">
                      F
                    </span>
                  </button>
                  <button
                    ref={softPad}
                    type="button"
                    className={styles.pad}
                    data-strength="soft"
                    aria-label="Soft"
                  >
                    <span aria-hidden="true">Soft</span>
                    <span className={styles.keys} aria-hidden="true">
                      J
                    </span>
                  </button>
                </div>
              )}
              {running && input === 'mic' && (
                <div className={styles.listen} role="img" aria-label="Listening for your guitar">
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
          {idle && !strum && (
            <p className={styles.note}>
              Tap Strong for a marked stroke and Soft for the rest. With a keyboard, F or Space is
              strong and J or Enter is soft.
            </p>
          )}
          {idle && strum && (
            <p className={styles.note}>
              Use headphones, so the microphone hears your guitar and not the click. Strum the
              marked strokes clearly harder than the rest.
            </p>
          )}
          {idle && (calibrating || offsets[input] === null) && (
            <div className={styles.calibrate} data-testid="d31-calibrate">
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

/** After a failed rep: the timing window, and the setting to widen it in place. */
function WindowNote() {
  const chosen = useAppStore((s) => s.settings.timingWindow);
  const hint = useId();
  const { onTimeMs } = ENGINE_CONFIG.rhythm.windows[chosen];
  return (
    <div className={styles.window} data-testid="d31-window">
      <label className={styles.windowRow}>
        Rhythm timing
        <TimingWindowSelect className={styles.select} aria-describedby={hint} />
      </label>
      <p id={hint} className={styles.note}>
        {chosen === 'relaxed'
          ? `Strokes count within ${onTimeMs} ms of the click, the widest window. If every stroke lands late, check your tap timing in Settings.`
          : `Strokes count within ${onTimeMs} ms of the click. If you’re in time but it doesn’t count, widen it for your next reps. It’s also in Settings.`}
      </p>
    </div>
  );
}

/** "1", "& of 2": what a step is called, for screen readers. */
function stepName(prompt: D31Prompt, step: number): string {
  const syl = prompt.syllables[step] ?? '';
  if (prompt.beatStarts.includes(step)) return syl;
  const beat = prompt.beatStarts.filter((s) => s <= step).length;
  return `${syl || 'step'} of ${beat}`;
}

function strokeName(prompt: D31Prompt, step: number): string {
  if (!prompt.hits.includes(step)) return 'rest';
  const strength = prompt.accents.includes(step) ? 'strong' : 'soft';
  const stroke = prompt.strokes?.[step];
  return stroke ? `${strength} ${stroke} strum` : `${strength} tap`;
}

/** The grid's size: its steps, and the felt beats that leave a gap between them. */
function gridStyle(prompt: D31Prompt): CSSProperties {
  return {
    '--steps': prompt.steps,
    '--beats': prompt.beatStarts.length,
  } as CSSProperties;
}

interface BarGridProps {
  prompt: D31Prompt;
  /** Show the count ("1 e & a") under the steps. */
  syllables: boolean;
  /** The step the click is on, lit; `null` for none. */
  playhead: number | null;
}

/**
 * One bar: a box per step, filled where it is played. A strong stroke has an
 * accent mark (>) over a heavier box; a strum shows its direction. Shape,
 * not colour alone, tells strong from soft.
 */
function BarGrid({ prompt, syllables, playhead }: BarGridProps) {
  return (
    <div className={styles.gridWrap}>
      <ol
        className={styles.grid}
        style={gridStyle(prompt)}
        aria-label="The bar, with its accents"
        data-testid="d31-grid"
      >
        {Array.from({ length: prompt.steps }, (_, step) => {
          const hit = prompt.hits.includes(step);
          const strong = prompt.accents.includes(step);
          const stroke = prompt.strokes?.[step];
          return (
            <li
              key={step}
              className={styles.cell}
              data-hit={hit}
              data-strong={strong}
              data-beat={prompt.beatStarts.includes(step)}
              aria-current={playhead === step ? 'step' : undefined}
              aria-label={`${stepName(prompt, step)}: ${strokeName(prompt, step)}`}
            >
              <span className={styles.mark} aria-hidden="true">
                {strong ? '>' : ''}
              </span>
              <span className={styles.box} aria-hidden="true">
                {hit && (stroke ? (stroke === 'down' ? '↓' : '↑') : '')}
              </span>
              {syllables && (
                <span className={styles.count} aria-hidden="true" data-testid="d31-syllable">
                  {prompt.syllables[step]}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

const VERDICT: Record<StrokeMark['verdict'], (m: StrokeMark) => string> = {
  on: (m) => `${m.accented ? 'strong' : 'soft'}, on time, ${d31DescribeOffset(m.offsetMs ?? 0)}`,
  early: (m) => `too early, ${d31DescribeOffset(m.offsetMs ?? 0)}`,
  late: (m) => `too late, ${d31DescribeOffset(m.offsetMs ?? 0)}`,
  miss: () => 'missed',
  soft: () => 'on time, but soft: it should be strong',
  loud: () => 'on time, but strong: it should be soft',
};

const GLYPH: Record<StrokeMark['verdict'], string> = {
  on: '✓',
  early: '◀',
  late: '▶',
  miss: '✕',
  soft: '!',
  loud: '!',
};

/** Every bar as played, each stroke marked, with how much of the click it had. */
function ResultGrid({
  prompt,
  feedback,
}: {
  prompt: D31Prompt;
  feedback: DrillFeedback<D31Answer>;
}) {
  const marks = d31Marks(prompt, feedback.answer);
  return (
    <div className={styles.results} data-testid="d31-results">
      {Array.from({ length: prompt.bars }, (_, bar) => {
        const rung = feedback.answer.rungs[bar];
        return (
          <div key={bar} className={styles.resultBar}>
            <p className={styles.barLabel}>
              Bar {bar + 1}
              {rung !== undefined && <span> · {d31BarClickLine(prompt, rung, bar)}</span>}
            </p>
            <div className={styles.gridWrap}>
              <ol className={styles.grid} style={gridStyle(prompt)} aria-label={`Bar ${bar + 1}`}>
                {Array.from({ length: prompt.steps }, (_, step) => {
                  const mark = marks.find((m) => m.bar === bar && m.step === step);
                  return (
                    <li
                      key={step}
                      className={styles.cell}
                      data-hit={Boolean(mark)}
                      data-strong={prompt.accents.includes(step)}
                      data-beat={prompt.beatStarts.includes(step)}
                      data-verdict={mark?.verdict}
                      aria-label={`${stepName(prompt, step)}: ${mark ? VERDICT[mark.verdict](mark) : 'rest'}`}
                    >
                      <span className={styles.mark} aria-hidden="true">
                        {prompt.accents.includes(step) ? '>' : ''}
                      </span>
                      <span className={styles.box} aria-hidden="true">
                        {mark ? GLYPH[mark.verdict] : ''}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </div>
          </div>
        );
      })}
      <p className={styles.key}>
        ✓ right, ◀ early, ▶ late, ✕ missed, ! the wrong strength. A mark (&gt;) shows a strong
        stroke.
      </p>
    </div>
  );
}
