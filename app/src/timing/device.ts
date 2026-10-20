/**
 * The timing engine's links to the device: the audio clock taps are mapped
 * onto, and the output latency to take off onsets, both read live from Tone's
 * context whenever Tone has loaded, whoever loaded it (the metronome, the
 * mic, the guitar). After M4-13 that may be the context the first tap made,
 * which Tone adopts, so it is always read through `getContext()`, never kept.
 * Nothing here loads Tone: only an unlock inside a gesture should.
 */
import { loadedTone } from '../audio/audio';
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

function rawContext(): (LatencyReport & { currentTime: number }) | null {
  const Tone = loadedTone();
  return Tone
    ? (Tone.getContext().rawContext as unknown as LatencyReport & { currentTime: number })
    : null;
}

/** The audio clock: Tone's live context, against `performance.now()`. Null until Tone loads. */
export function createToneClock(): AudioClock {
  return createAudioClock({
    contextSeconds: () => rawContext()?.currentTime ?? null,
    pageMs: () => performance.now(),
  });
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
