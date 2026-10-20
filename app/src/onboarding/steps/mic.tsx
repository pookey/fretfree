import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../../app-store';
import type { Settings } from '../../engine';
import {
  getPitchSource,
  PitchSourceError,
  type PitchSource,
  type PitchSourceErrorReason,
  type StableNote,
} from '../../mic';
import { midiToFretNote } from '../../theory';
import type { OnboardingStepProps } from '../registry';
import styles from '../Onboarding.module.css';
import local from './mic.module.css';

export const id = 'mic';
// Before the placement test, which stays last (design §4): the mic is an
// extra, so it comes after the questions every learner answers.
export const order = 65;
export const title = 'Play on your real guitar?';
export const skippable = true;
export const explanation = (
  <>
    <p>
      Mic mode lets some drills listen: you play the note on your guitar instead of tapping it. It
      turns knowing the neck into playing it. Everything else works without it.
    </p>
    <p>
      FretFree listens for pitch only while you use a mic drill, the tuner or this check. Nothing is
      recorded, and no sound leaves this device.
    </p>
  </>
);

/**
 * What to tell the learner when the mic can't start, one line per reason.
 * Mic mode stays off in every case, and nothing else depends on it.
 */
export const MIC_ERROR_COPY: Record<PitchSourceErrorReason, { title: string; detail: string }> = {
  denied: {
    title: 'Microphone access was refused.',
    detail:
      'To allow it, turn on the microphone for this site in your browser’s settings (on an iPad: Settings › Apps › Safari › Microphone), then try again.',
  },
  'no-device': {
    title: 'No microphone was found.',
    detail: 'Connect a microphone or headset with one, then try again.',
  },
  unsupported: {
    title: 'This browser can’t listen for pitch.',
    detail: 'Mic mode needs a recent Safari, Chrome or Firefox. Every drill still works by tap.',
  },
  failed: {
    title: 'The microphone didn’t start.',
    detail: 'Another app may be using it. Close that app, then try again.',
  },
  lost: {
    title: 'The microphone stopped.',
    detail:
      'It was unplugged, another app took it, or FretFree went to the background. Try again to listen.',
  },
};

export type MicCheckPhase = 'idle' | 'starting' | 'listening' | 'error';

export interface MicCheck {
  phase: MicCheckPhase;
  /** Set when `phase` is `error`. */
  reason: PitchSourceErrorReason | null;
  /** The last steady note heard since listening began: proof the mic works. */
  heard: StableNote | null;
  /**
   * Asks for the mic and starts listening; resolves true once it is. **Call it
   * straight from a tap handler**, before any other `await` (iOS grants the
   * mic only inside the gesture).
   */
  listen(): Promise<boolean>;
  /** Stops listening, if this check started it. */
  stop(): void;
}

/**
 * Enabling mic mode and checking it hears the guitar (design §9). Nothing
 * touches the microphone until `listen()`, and the mic is released on
 * unmount, so a screen that checks the mic never keeps it open.
 */
export function useMicCheck(source: PitchSource = getPitchSource()): MicCheck {
  const [phase, setPhase] = useState<MicCheckPhase>('idle');
  const [reason, setReason] = useState<PitchSourceErrorReason | null>(null);
  const [heard, setHeard] = useState<StableNote | null>(null);
  const owns = useRef(false);

  useEffect(() => {
    const offNote = source.onNote(setHeard);
    const offState = source.onStateChange((state) => {
      // Stopped elsewhere (say, by the tuner taking over): show it as off.
      if (state === 'idle') {
        owns.current = false;
        setPhase((p) => (p === 'listening' ? 'idle' : p));
      }
      // Lost mid-check (unplugged, taken by a call, the page backgrounded). A
      // start that fails instead is reported by `listen()`.
      if (state === 'error' && source.error?.reason === 'lost') {
        owns.current = false;
        setReason('lost');
        setPhase((p) => (p === 'listening' ? 'error' : p));
      }
    });
    return () => {
      offNote();
      offState();
      if (owns.current) source.stop();
      owns.current = false;
    };
  }, [source]);

  const listen = async () => {
    // Already running for someone else (a drill, the tuner): listen along, but
    // leave stopping it to them.
    const shared = source.state === 'running';
    // First, inside the tap: no await may come before it.
    const started = source.start();
    owns.current = !shared;
    setHeard(null);
    setReason(null);
    setPhase('starting');
    try {
      await started;
    } catch (err) {
      owns.current = false;
      setReason(err instanceof PitchSourceError ? err.reason : 'failed');
      setPhase('error');
      return false;
    }
    // start() resolves without running if stop() came first.
    if (source.state !== 'running') {
      owns.current = false;
      setPhase('idle');
      return false;
    }
    setPhase('listening');
    return true;
  };

  const stop = () => {
    if (owns.current) source.stop();
    owns.current = false;
    setPhase('idle');
  };

  return { phase, reason, heard, listen, stop };
}

/** A note as the learner reads it elsewhere: `A2`, `F♯3`, `B♭2`. */
export function heardName(note: StableNote, pref: Settings['accidentalPref']): string {
  return midiToFretNote(note.midi, pref)
    .name.replace('#', '♯')
    .replace(/^([A-G])b/, '$1♭');
}

/**
 * The check's live status: asking, listening (and what it heard), or why the
 * mic couldn't start. "Mic is working" is a label as well as a colour.
 */
export function MicStatus({ check }: { check: MicCheck }) {
  const pref = useAppStore((s) => s.settings.accidentalPref);
  const { phase, reason, heard } = check;
  if (phase === 'error' && reason) {
    const copy = MIC_ERROR_COPY[reason];
    return (
      <div className={local.problem} role="alert" data-testid="mic-error" data-reason={reason}>
        <strong>{copy.title}</strong>
        <span>{copy.detail}</span>
      </div>
    );
  }
  return (
    <div
      className={local.status}
      role="status"
      data-testid="mic-status"
      data-phase={phase}
      data-heard={heard ? 'true' : undefined}
    >
      {phase === 'starting' && <span>Waiting for the microphone…</span>}
      {phase === 'listening' &&
        (heard ? (
          <>
            <span className={local.ok} aria-hidden="true">
              ✓
            </span>
            <span>
              <strong>Mic is working.</strong> Heard{' '}
              <span data-testid="mic-heard">{heardName(heard, pref)}</span>.
            </span>
          </>
        ) : (
          <>
            <span className={local.pulse} aria-hidden="true" />
            <span>Listening. Play any open string.</span>
          </>
        ))}
    </div>
  );
}

/**
 * Turning mic mode on asks for the mic, so the permission prompt follows the
 * learner's tap (design §9). Mic mode is saved only once the mic runs; a
 * refusal leaves it off, says why, and setup carries on.
 */
export function MicStep({ onNext, source }: OnboardingStepProps & { source?: PitchSource }) {
  const micEnabled = useAppStore((s) => s.settings.micEnabled);
  const update = useAppStore((s) => s.update);
  const check = useMicCheck(source);
  const { phase } = check;
  const busy = phase === 'starting';

  const enable = async () => {
    if (await check.listen()) await update({ micEnabled: true });
  };
  const done = () => {
    check.stop();
    onNext();
  };

  return (
    <div className={local.step}>
      {phase === 'idle' && micEnabled && (
        <p className={local.note}>
          Mic mode is on. Check it again, or carry on: you can turn it off in Settings.
        </p>
      )}
      <MicStatus check={check} />
      {phase === 'listening' ? (
        <button type="button" className={styles.primary} onClick={done}>
          Continue
        </button>
      ) : (
        <>
          <button
            type="button"
            className={styles.primary}
            disabled={busy}
            onClick={() => void enable()}
          >
            {phase === 'error'
              ? 'Try again'
              : micEnabled
                ? 'Check the microphone'
                : 'Turn on mic mode'}
          </button>
          <button type="button" className={local.later} disabled={busy} onClick={onNext}>
            {micEnabled ? 'Continue' : 'Not now'}
          </button>
        </>
      )}
      <p className={local.note}>You can turn mic mode on or off at any time in Settings.</p>
    </div>
  );
}

export function Step({ onNext }: OnboardingStepProps) {
  return <MicStep onNext={onNext} />;
}
