import { useEffect, useRef, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { useAppStore } from '../../app-store';
import { Fretboard } from '../../components/fretboard/Fretboard';
import { ENGINE_CONFIG } from '../../engine/config';
import { useSizeClass } from '../../shell/size-class';
import { allStrings, getTuning, type FretRange, type Position } from '../../theory';
import { foreperiod, latencyBaseline, nextDot, type CalibrationResult } from './stats';
import onboarding from '../Onboarding.module.css';
import styles from './Calibration.module.css';

const CFG = ENGINE_CONFIG.calibration;
/** Six frets fit every size class with ≥44pt cells, so a resize never strands the dot. */
const RANGE: FretRange = { from: 0, to: 5 };
/** A run's rough length for the copy: a pause and a default-speed tap per dot, to the nearest 5s. */
const SECONDS =
  Math.round(
    (CFG.trials *
      ((CFG.foreperiodMs.min + CFG.foreperiodMs.max) / 2 +
        ENGINE_CONFIG.grading.defaultBaselineMs)) /
      5000,
  ) * 5;

type Phase = 'ready' | 'running' | 'done';

const perfNow = () => performance.now();

/**
 * "Tap the lit dot" (design §4 step 5): `trials` dots light one at a time
 * after a random pause, and the trimmed median tap time becomes
 * `settings.latencyBaselineMs`, which every speed target is built on (§3.2).
 * `doneAction` shows beside "Run again" once a baseline is saved.
 */
export function Calibration({
  doneAction,
  now = perfNow,
  rng = Math.random,
}: {
  doneAction?: ReactNode;
  now?: () => number;
  rng?: () => number;
}) {
  const sizeClass = useSizeClass();
  const settings = useAppStore((s) => s.settings);
  const update = useAppStore((s) => s.update);
  const [phase, setPhase] = useState<Phase>('ready');
  const [lit, setLit] = useState<Position | null>(null);
  const [taps, setTaps] = useState(0);
  const [result, setResult] = useState<CalibrationResult | null>(null);
  const samples = useRef<number[]>([]);
  const last = useRef<Position | null>(null);
  const litAt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const tuning = getTuning(settings.tuning);
  const strings = allStrings(tuning);

  const lightNext = () => {
    timer.current = setTimeout(() => {
      const pos = nextDot(last.current, strings, RANGE, rng);
      last.current = pos;
      // Commit the dot first so the clock starts as close to paint as we can get.
      flushSync(() => setLit(pos));
      litAt.current = now();
    }, foreperiod(rng));
  };

  const start = () => {
    samples.current = [];
    last.current = null;
    setTaps(0);
    setResult(null);
    setPhase('running');
    lightNext();
  };

  const finish = async () => {
    const r = latencyBaseline(samples.current);
    setResult(r);
    setPhase('done');
    if (r.baselineMs !== null) await update({ latencyBaselineMs: r.baselineMs });
  };

  const tap = (pos: Position) => {
    // Taps between dots or off the dot don't count.
    if (phase !== 'running' || !lit || pos.string !== lit.string || pos.fret !== lit.fret) return;
    samples.current.push(now() - litAt.current);
    setLit(null);
    setTaps(samples.current.length);
    if (samples.current.length >= CFG.trials) void finish();
    else lightNext();
  };

  const saved = phase === 'done' && result?.baselineMs != null;

  return (
    <div className={styles.calibration} data-phase={phase} data-size-class={sizeClass}>
      <div className={styles.status} aria-live="polite">
        {phase === 'ready' && (
          <>
            <p className={onboarding.lead}>
              Tap each dot as soon as it lights up: {CFG.trials} dots, about {SECONDS} seconds.
            </p>
            {settings.latencyBaselineMs !== null && (
              <p className={styles.muted} data-testid="calibration-current">
                Your tap time now: {settings.latencyBaselineMs} ms
              </p>
            )}
          </>
        )}
        {phase === 'running' && (
          <>
            <p className={onboarding.lead}>Tap the lit dot</p>
            <progress
              className={styles.progress}
              max={CFG.trials}
              value={taps}
              aria-label="Dots tapped"
            />
            <p className={styles.muted} data-testid="calibration-count">
              {taps} of {CFG.trials}
            </p>
          </>
        )}
        {saved && (
          <p className={onboarding.lead} data-testid="calibration-result">
            Your tap time is <strong>{result.baselineMs} ms</strong>. Answers are timed against it,
            so your screen and your reach never count against you.
          </p>
        )}
        {phase === 'done' && !saved && (
          <p className={onboarding.lead} data-testid="calibration-result">
            Too many of those taps were missed or very slow to use. Give it another go.
          </p>
        )}
      </div>

      <div className={styles.neck}>
        <Fretboard
          tuning={tuning}
          fretRange={RANGE}
          handedness={settings.handedness}
          guideLevel={1}
          markers={lit ? [{ ...lit, style: 'target' }] : []}
          onTapCell={tap}
          label="Calibration neck"
        />
      </div>

      {phase === 'ready' && (
        <button type="button" className={onboarding.primary} onClick={start}>
          Start
        </button>
      )}
      {phase === 'done' && (
        <div className={styles.actions}>
          {saved ? (
            <>
              {doneAction}
              <button type="button" className={onboarding.link} onClick={start}>
                Run again
              </button>
            </>
          ) : (
            <button type="button" className={onboarding.primary} onClick={start}>
              Try again
            </button>
          )}
        </div>
      )}
    </div>
  );
}
