import { useEffect, useId, useRef, useState } from 'react';
import { useAppStore } from '../app-store';
import { ENGINE_CONFIG } from '../engine/config';
import { useSizeClass } from '../shell/size-class';
import { runCalibration, type CalibrationProgress, type CalibrationRun } from './calibrate';
import { createToneTapSource, currentOutputLatencyMs } from './device';
import { fakeOnsetsForE2E } from './e2e-hook';
import type { CalibrationResult, OnsetKind } from './latency';
import { createMicOnsetSource } from './mic-onsets';
import { getMetronome, type Click, type Metronome } from './metronome';
import type { OnsetSource, TapSource } from './onsets';
import styles from './TimingCalibration.module.css';

const CFG = ENGINE_CONFIG.timing.calibration;
const SECONDS = Math.round((CFG.clicks * 60) / CFG.bpm);

/** Within this many ms either way, the learner is on the click. */
const ON_THE_CLICK_MS = 5;

export function describeOffset(ms: number): string {
  if (Math.abs(ms) < ON_THE_CLICK_MS) return 'right on the click';
  return `${Math.abs(ms)} ms ${ms > 0 ? 'late' : 'early'}`;
}

/** The app's onset source for an input: the e2e fake when switched on, else taps or the mic. */
function defaultSource(kind: OnsetKind): OnsetSource {
  return (
    fakeOnsetsForE2E(kind) ?? (kind === 'tap' ? createToneTapSource() : createMicOnsetSource())
  );
}

function isTapSource(source: OnsetSource): source is TapSource {
  return 'attach' in source;
}

type Phase =
  | { name: 'ready' }
  | { name: 'running'; progress: CalibrationProgress }
  | { name: 'done'; result: CalibrationResult }
  | { name: 'error' };

const COPY: Record<OnsetKind, { label: string; how: string; verb: string }> = {
  tap: {
    label: 'Tap timing',
    how: 'Tap the pad (or press Space) on each click.',
    verb: 'taps',
  },
  mic: {
    label: 'Guitar timing',
    how: 'Play one short note or a muted strum on each click.',
    verb: 'notes',
  },
};

export interface TimingCalibrationProps {
  kind: OnsetKind;
  onDone?: () => void;
  /** For tests. */
  metronome?: Metronome;
  createSource?: (kind: OnsetKind) => OnsetSource;
}

/**
 * The tap-to-click calibration (design §12): a bar of count-in, then ~10s of
 * clicks to tap or play along with. The offset left after the device's
 * output latency is saved to `settings.timingOffsets`, and every timing drill
 * takes it off the learner's onsets, so a slow screen or speaker never counts
 * against them.
 */
export function TimingCalibration({
  kind,
  onDone,
  metronome = getMetronome(),
  createSource = defaultSource,
}: TimingCalibrationProps) {
  const sizeClass = useSizeClass();
  const offsets = useAppStore((s) => s.settings.timingOffsets);
  const update = useAppStore((s) => s.update);
  const [phase, setPhase] = useState<Phase>({ name: 'ready' });
  const [beat, setBeat] = useState<Click | null>(null);
  const run = useRef<CalibrationRun | null>(null);
  const pad = useRef<HTMLButtonElement>(null);
  const [source, setSource] = useState<OnsetSource | null>(null);
  const copy = COPY[kind];

  useEffect(() => () => run.current?.cancel(), []);

  // The beat light follows the click on its animation frame.
  useEffect(() => {
    if (phase.name !== 'running') return;
    let off: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = metronome.onBeat((click) => {
      setBeat(click);
      clearTimeout(off);
      off = setTimeout(() => setBeat(null), 100);
    });
    return () => {
      unsubscribe();
      clearTimeout(off);
    };
  }, [phase.name, metronome]);

  // Taps count from the pad; it takes focus so Space works at once.
  useEffect(() => {
    const el = pad.current;
    if (!el || !source || !isTapSource(source)) return;
    el.focus();
    return source.attach(el);
  }, [source]);

  const start = () => {
    const next = createSource(kind);
    setSource(next);
    const r = runCalibration({ metronome, source: next, outputLatencyMs: currentOutputLatencyMs });
    run.current = r;
    setPhase({ name: 'running', progress: { clicks: 0, total: CFG.clicks, onsets: 0 } });
    r.onProgress((progress) => {
      if (run.current === r) setPhase({ name: 'running', progress });
    });
    r.done.then(
      async (result) => {
        if (run.current !== r) return;
        run.current = null;
        setSource(null);
        if (!result) return setPhase({ name: 'ready' });
        setPhase({ name: 'done', result });
        if (result.ok) await update({ timingOffsets: { ...offsets, [kind]: result.offsetMs } });
      },
      () => {
        if (run.current !== r) return;
        run.current = null;
        setSource(null);
        setPhase({ name: 'error' });
      },
    );
  };

  const cancel = () => {
    run.current?.cancel();
  };

  const running = phase.name === 'running';
  const countingIn = running && phase.progress.clicks === 0;

  return (
    <div className={styles.panel} data-size-class={sizeClass} data-phase={phase.name}>
      <div className={styles.status} aria-live="polite">
        {phase.name === 'ready' && (
          <p>
            {copy.how} A bar of four counts you in, then {CFG.clicks} clicks: about {SECONDS}{' '}
            seconds.
          </p>
        )}
        {running && (
          <>
            <p>{countingIn ? 'Get ready: four counts in…' : copy.how}</p>
            <progress
              className={styles.progress}
              max={CFG.clicks}
              value={phase.progress.clicks}
              aria-label="Clicks so far"
            />
          </>
        )}
        {phase.name === 'done' && phase.result.ok && (
          <p data-testid="timing-calibration-result">
            Your {copy.verb} land <strong>{describeOffset(phase.result.offsetMs)}</strong> on this
            device. Timing drills allow for it.
          </p>
        )}
        {phase.name === 'done' && !phase.result.ok && (
          <p data-testid="timing-calibration-result">
            {phase.result.reason === 'uneven'
              ? `Those ${copy.verb} were too uneven to measure. Try again, keeping with the click.`
              : `Too few ${copy.verb} landed near the clicks to measure. Give it another go.`}
          </p>
        )}
        {phase.name === 'error' && (
          <p data-testid="timing-calibration-result">
            The microphone didn&apos;t start. Check that FretFree may use it, then try again.
          </p>
        )}
      </div>

      {running && kind === 'tap' && (
        <button ref={pad} type="button" className={styles.pad} aria-label="Tap on each click">
          <span className={styles.light} data-on={beat !== null} data-accent={beat?.accent} />
          Tap
        </button>
      )}
      {running && kind === 'mic' && (
        <div className={styles.pad} role="img" aria-label="Listening for your guitar">
          <span className={styles.light} data-on={beat !== null} data-accent={beat?.accent} />
          Listening…
        </div>
      )}

      <div className={styles.actions}>
        {running ? (
          <button type="button" className={styles.button} onClick={cancel}>
            Cancel
          </button>
        ) : (
          <>
            {phase.name === 'done' && onDone && (
              <button type="button" className={styles.button} onClick={onDone}>
                Done
              </button>
            )}
            <button type="button" className={styles.primary} onClick={start}>
              {phase.name === 'ready' ? 'Start' : 'Try again'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function OffsetRow({ kind }: { kind: OnsetKind }) {
  const offset = useAppStore((s) => s.settings.timingOffsets[kind]);
  const [open, setOpen] = useState(false);
  const panel = useId();
  return (
    <>
      <div className={styles.row}>
        <span>
          {COPY[kind].label}{' '}
          <span className={styles.muted} data-testid={`timing-offset-${kind}`}>
            {offset === null ? 'not checked' : describeOffset(offset)}
          </span>
        </span>
        <button
          type="button"
          className={styles.button}
          aria-expanded={open}
          aria-controls={panel}
          onClick={() => setOpen(!open)}
        >
          {open ? 'Close' : offset === null ? 'Check' : 'Check again'}
        </button>
      </div>
      {open && (
        <div id={panel}>
          <TimingCalibration kind={kind} onDone={() => setOpen(false)} />
        </div>
      )}
    </>
  );
}

/**
 * The Settings rows: the stored offset per input and a calibration run in
 * place. The guitar row shows only in mic mode.
 */
export function TimingCalibrationSetting() {
  const micEnabled = useAppStore((s) => s.settings.micEnabled);
  return (
    <div className={styles.setting}>
      <OffsetRow kind="tap" />
      {micEnabled && <OffsetRow kind="mic" />}
    </div>
  );
}
