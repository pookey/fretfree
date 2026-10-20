/**
 * The timing engine's links to the device: the audio clock taps are mapped
 * onto, and the output latency to take off onsets, both read from Tone's
 * context once Tone has loaded (it loads lazily, on the first sound).
 */
import { loadTone } from '../audio/audio';
import type { TimingOffsets } from '../engine/model';
import { createAudioClock, type AudioClock } from './clock';
import {
  compensation,
  outputLatencyMs,
  type Compensation,
  type LatencyReport,
  type OnsetKind,
} from './latency';
import { createTapOnsetSource, type TapSource } from './onsets';

type ToneModule = typeof import('tone');

let tone: ToneModule | null = null;

function rawContext(): (LatencyReport & { currentTime: number }) | null {
  return tone
    ? (tone.getContext().rawContext as unknown as LatencyReport & { currentTime: number })
    : null;
}

/** The audio clock: Tone's context, against `performance.now()`. Null until Tone loads. */
export function createToneClock(): AudioClock {
  const clock = createAudioClock({
    contextSeconds: () => rawContext()?.currentTime ?? null,
    pageMs: () => performance.now(),
  });
  return {
    ...clock,
    start() {
      void loadTone().then((Tone) => (tone = Tone));
      clock.start();
    },
  };
}

/** Taps on the audio clock the metronome runs on. */
export function createToneTapSource(options?: { keys?: readonly string[] }): TapSource {
  return createTapOnsetSource(createToneClock(), options);
}

/** The context's output latency now, in ms; 0 before Tone loads. */
export function currentOutputLatencyMs(): number {
  const raw = rawContext();
  return raw ? outputLatencyMs(raw) : 0;
}

/** What to take off a `kind` onset now: the live output latency and the learner's offset. */
export function liveCompensation(kind: OnsetKind, offsets: TimingOffsets): Compensation {
  return compensation(kind, offsets, { outputLatency: currentOutputLatencyMs() / 1000 });
}
