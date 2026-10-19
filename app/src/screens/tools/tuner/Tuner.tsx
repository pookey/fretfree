import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Link } from 'react-router';
import { useAppStore } from '../../../app-store';
import { getPitchSource } from '../../../mic/source';
import type { PitchSource, PitchSourceError, PitchSourceState } from '../../../mic/types';
import { useSizeClass } from '../../../shell/size-class';
import { STANDARD_TUNING } from '../../../theory';
import { TUNER_CONFIG } from './config';
import {
  adviceLabel,
  createPitchSmoother,
  formatCents,
  isVoiced,
  needleAngle,
  readPitch,
  stringOrdinal,
  tunerStrings,
  type TunerReading,
  type TunerString,
} from './logic';
import styles from './Tuner.module.css';

export interface ToneSound {
  muted: boolean;
  volume: number;
}

/** Plays a reference tone. The audio module is in first-load JS already, so this fetches nothing. */
export function playReferenceTone(note: string, sound: ToneSound): void {
  void import('../../../audio/audio')
    .then(async (audio) => {
      await audio.unlockAudio();
      await audio.playNotes([note], { ...sound, duration: TUNER_CONFIG.referenceTone.durationS });
    })
    .catch(() => {
      /* No audio in this browser; the tuner still works by mic. */
    });
}

export interface TunerProps {
  /** Default: the app's shared pitch source (the real detector, or a fake in e2e). */
  source?: PitchSource;
  playTone?: (note: string, sound: ToneSound) => void;
}

/**
 * The tuner (design §7 Tools, §9): a needle and cents readout against the
 * string being tuned (the one the learner tapped, else the nearest in
 * standard tuning), the note heard, and reference tones to tune by ear. It doubles as the mic check: `data-state="working"` on the
 * mic panel once a note has been heard. The mic is requested only when the
 * learner taps Start, and released when the tuner closes.
 */
export function Tuner({ source: given, playTone = playReferenceTone }: TunerProps) {
  const [source] = useState(() => given ?? getPitchSource());
  const state = useSyncExternalStore(source.onStateChange, () => source.state);
  const { accidentalPref, soundOn, volume } = useAppStore((s) => s.settings);
  const strings = useMemo(() => tunerStrings(STANDARD_TUNING, accidentalPref), [accidentalPref]);
  const layout = useSizeClass() === 'compact' ? 'stack' : 'split';

  const [smoother] = useState(() => createPitchSmoother());
  const [frequency, setFrequency] = useState<number | null>(null);
  const [heard, setHeard] = useState(false);
  const [sounding, setSounding] = useState<TunerString | null>(null);
  // The string the learner tapped; null tunes whichever string is nearest.
  const [chosen, setChosen] = useState<number | null>(null);
  const soundingRef = useRef(false);
  const toneTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const off = source.onFrame((frame) => {
      // The speaker's reference tone would read as the learner's note.
      if (soundingRef.current) return;
      if (isVoiced(frame)) setHeard(true);
      setFrequency(smoother.push(frame));
    });
    return () => {
      off();
      clearTimeout(toneTimer.current);
      // Leaving the tool releases the mic and its AudioContext.
      source.stop();
    };
  }, [source, smoother]);

  const forget = () => {
    smoother.reset();
    setFrequency(null);
  };

  const start = () => {
    // First, inside the tap: iOS grants the mic only within the gesture.
    const started = source.start();
    forget();
    setHeard(false);
    // A failure shows through `state` and `source.error`.
    started.catch(() => undefined);
  };

  const play = (s: TunerString) => {
    setChosen(s.string);
    if (!soundOn) return;
    playTone(s.name, { muted: false, volume });
    soundingRef.current = true;
    forget();
    setSounding(s);
    clearTimeout(toneTimer.current);
    toneTimer.current = setTimeout(() => {
      soundingRef.current = false;
      setSounding(null);
    }, TUNER_CONFIG.referenceTone.muteMicMs);
  };

  const listening = state === 'running' && !sounding;
  const reading =
    listening && frequency !== null
      ? readPitch(frequency, strings, { target: chosen, pref: accidentalPref })
      : null;
  const target = reading?.string ?? strings.find((s) => s.string === chosen) ?? null;

  return (
    <div className={styles.tuner} data-layout={layout}>
      <MicPanel
        state={state}
        error={source.error}
        heard={heard}
        onStart={start}
        onStop={() => source.stop()}
      />
      <Dial
        reading={reading}
        target={target}
        chosen={chosen !== null}
        state={state}
        sounding={sounding}
        onAuto={() => setChosen(null)}
      />
      <ReferenceTones
        strings={strings}
        reading={reading}
        chosen={chosen}
        sounding={sounding}
        soundOn={soundOn}
        onPlay={play}
      />
    </div>
  );
}

// --- The mic check -------------------------------------------------------------

type MicCheck = 'off' | 'starting' | 'listening' | 'working' | PitchSourceError['reason'];

const MIC_COPY: Record<MicCheck, string> = {
  off: 'The tuner listens through your microphone. FretFree asks for it only when you tap Start, and the sound never leaves this device.',
  starting: 'Starting the microphone… If your browser asks, allow it.',
  listening: 'Listening. Play an open string.',
  working: 'Mic is working. FretFree can hear you.',
  denied:
    'FretFree isn’t allowed to use the microphone. To tune by mic, allow it for this site in your browser’s settings (in Safari: the page settings button in the address bar, then Website Settings, then Microphone), and tap Try again.',
  'no-device':
    'No microphone was found. Connect one, or check that another app isn’t using it, then tap Try again.',
  unsupported:
    'This browser can’t listen through a microphone. Try Safari or Chrome, or tune by ear with the reference tones.',
  failed: 'The microphone couldn’t start. Tap Try again.',
  lost: 'The mic stopped. It was unplugged, another app took it, or FretFree went to the background. Tap Restart to listen again.',
};

function micCheck(
  state: PitchSourceState,
  error: PitchSourceError | null,
  heard: boolean,
): MicCheck {
  if (state === 'error') return error?.reason ?? 'failed';
  if (state === 'starting') return 'starting';
  if (state === 'running') return heard ? 'working' : 'listening';
  return 'off';
}

function MicPanel({
  state,
  error,
  heard,
  onStart,
  onStop,
}: {
  state: PitchSourceState;
  error: PitchSourceError | null;
  heard: boolean;
  onStart: () => void;
  onStop: () => void;
}) {
  const check = micCheck(state, error, heard);
  const failed = state === 'error';
  return (
    <div className={styles.mic} data-testid="mic-check" data-state={check}>
      <p className={styles.micState} role={failed ? 'alert' : 'status'}>
        {check === 'working' && (
          <span className={styles.working} aria-hidden>
            ✓
          </span>
        )}
        {MIC_COPY[check]}
      </p>
      <div className={styles.micActions}>
        {state === 'idle' && (
          <button type="button" className={styles.primary} onClick={onStart}>
            Start tuner
          </button>
        )}
        {failed && check !== 'unsupported' && (
          <button type="button" className={styles.primary} onClick={onStart}>
            {check === 'lost' ? 'Restart' : 'Try again'}
          </button>
        )}
        {(state === 'running' || state === 'starting') && (
          <button type="button" className={styles.secondary} onClick={onStop}>
            Stop
          </button>
        )}
      </div>
    </div>
  );
}

// --- The needle ----------------------------------------------------------------

const PIVOT = { x: 120, y: 132 };
const RADIUS = 104;

function polar(deg: number, r: number) {
  const rad = (deg * Math.PI) / 180;
  return { x: PIVOT.x + r * Math.sin(rad), y: PIVOT.y - r * Math.cos(rad) };
}

function arc(fromDeg: number, toDeg: number, r: number): string {
  const a = polar(fromDeg, r);
  const b = polar(toDeg, r);
  return `M ${a.x} ${a.y} A ${r} ${r} 0 0 1 ${b.x} ${b.y}`;
}

const TICKS = Array.from({ length: 21 }, (_, i) => i * 5 - 50);

function idleLabel(state: PitchSourceState, sounding: TunerString | null): string {
  if (sounding) return `Playing ${sounding.name}. The needle waits while it sounds.`;
  if (state === 'running') return 'Play a string';
  return 'Not listening';
}

function Dial({
  reading,
  target,
  chosen,
  state,
  sounding,
  onAuto,
}: {
  reading: TunerReading | null;
  /** The string being tuned, if any yet. */
  target: TunerString | null;
  /** Whether the learner picked `target` (rather than it being the nearest). */
  chosen: boolean;
  state: PitchSourceState;
  sounding: TunerString | null;
  onAuto: () => void;
}) {
  const inTune = reading?.advice === 'in-tune';
  const angle = reading ? needleAngle(reading.cents) : 0;
  const advice = reading ? adviceLabel(reading.cents) : '';
  const band = needleAngle(TUNER_CONFIG.inTuneCents);
  const meter = reading
    ? {
        role: 'meter',
        'aria-label': 'Tuning needle',
        'aria-valuemin': -50,
        'aria-valuemax': 50,
        'aria-valuenow': Math.max(-50, Math.min(50, Math.round(reading.cents))),
        'aria-valuetext': `${reading.string.name} string, ${formatCents(reading.cents)}, ${advice.toLowerCase()}`,
      }
    : {};
  return (
    <div className={styles.dial} data-advice={reading?.advice ?? 'none'}>
      <div className={styles.gauge} data-testid="tuner-needle" data-angle={angle} {...meter}>
        <svg viewBox="0 0 240 150" aria-hidden className={styles.svg}>
          <path d={arc(-band, band, RADIUS - 8)} className={styles.band} />
          {TICKS.map((c) => {
            const deg = needleAngle(c);
            const long = c % 10 === 0;
            const a = polar(deg, RADIUS);
            const b = polar(deg, RADIUS - (long ? 14 : 7));
            return (
              <line
                key={c}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                className={c === 0 ? styles.tickZero : styles.tick}
              />
            );
          })}
          <text {...polar(-66, RADIUS + 4)} className={styles.end}>
            ♭
          </text>
          <text {...polar(66, RADIUS + 4)} className={styles.end}>
            ♯
          </text>
          {/* The in-tune mark: a hollow triangle that fills into a ticked disc. */}
          {inTune ? (
            <g data-testid="in-tune-mark">
              <circle cx={PIVOT.x} cy={12} r={10} className={styles.markOn} />
              <path d="M 115 12 l 3.5 3.5 l 6.5 -7" className={styles.markTick} />
            </g>
          ) : (
            <path d="M 112 4 L 128 4 L 120 18 Z" className={styles.markOff} />
          )}
          <g
            className={styles.needle}
            data-idle={!reading}
            style={{ transform: `rotate(${angle}deg)` }}
          >
            <line x1={PIVOT.x} y1={PIVOT.y} x2={PIVOT.x} y2={PIVOT.y - RADIUS + 4} />
            <circle cx={PIVOT.x} cy={PIVOT.y} r={7} />
          </g>
        </svg>
      </div>
      <div className={styles.readout}>
        <p className={styles.label} data-testid="tuner-string">
          {target
            ? `${stringOrdinal(target.string)} string${chosen ? '' : ' · nearest'}`
            : 'Standard tuning: E A D G B E'}
        </p>
        <p className={styles.note} data-testid="tuner-note">
          {target ? (
            <>
              {target.pc}
              <sub>{target.name.slice(target.pc.length)}</sub>
            </>
          ) : (
            <span className={styles.placeholder}>–</span>
          )}
        </p>
        <p className={styles.cents} data-testid="tuner-cents">
          {reading ? formatCents(reading.cents) : '\u00a0'}
        </p>
        <p className={styles.advice} data-testid="tuner-advice">
          {reading ? (
            <>
              <span aria-hidden className={styles.adviceIcon}>
                {inTune ? '✓' : reading.advice === 'tune-up' ? '↑' : '↓'}
              </span>
              {advice}
            </>
          ) : (
            idleLabel(state, sounding)
          )}
        </p>
        <p className={styles.heard} data-testid="tuner-heard">
          {reading ? `Heard ${reading.heard.name}` : '\u00a0'}
        </p>
        {chosen && (
          <button type="button" className={styles.secondary} onClick={onAuto}>
            Tune the nearest string
          </button>
        )}
      </div>
    </div>
  );
}

// --- Reference tones -------------------------------------------------------------

function ReferenceTones({
  strings,
  reading,
  chosen,
  sounding,
  soundOn,
  onPlay,
}: {
  strings: readonly TunerString[];
  reading: TunerReading | null;
  chosen: number | null;
  sounding: TunerString | null;
  soundOn: boolean;
  onPlay: (s: TunerString) => void;
}) {
  const heading = useId();
  return (
    <section className={styles.reference} aria-labelledby={heading}>
      <h2 id={heading} className={styles.label}>
        Reference tones
      </h2>
      <p className={styles.muted}>
        Tap a string to tune it and hear its note. The needle waits while it sounds.
      </p>
      <ul className={styles.strings}>
        {strings.map((s) => {
          const target = (reading?.string.string ?? chosen) === s.string;
          const inTune = target && reading?.advice === 'in-tune';
          return (
            <li key={s.string}>
              <button
                type="button"
                className={styles.stringButton}
                aria-label={`${s.name}, ${stringOrdinal(s.string)} string`}
                aria-pressed={chosen === s.string}
                data-target={target}
                data-in-tune={inTune}
                data-sounding={sounding?.string === s.string}
                onClick={() => onPlay(s)}
              >
                <span className={styles.stringPc}>{s.pc}</span>
                <span className={styles.stringMeta}>{s.name}</span>
                <span className={styles.stringMark} aria-hidden>
                  {inTune ? '✓' : target ? '◆' : sounding?.string === s.string ? '♪' : ''}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {!soundOn && (
        <p className={styles.muted}>
          Sound is off, so tapping a string picks it without a tone.{' '}
          <Link to="/settings">Turn it on in Settings</Link>.
        </p>
      )}
    </section>
  );
}
