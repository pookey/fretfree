/**
 * Mic onset detection (design §12), pure and clock-free: log-compressed
 * spectral flux over a Hann window every hop, an adaptive threshold (a
 * multiple of the recent median flux plus a floor), peak picking, an RMS gate
 * and a refractory period. A pick or strum is broadband, so the flux jumps;
 * a ringing note barely changes its spectrum, so it doesn't. A re-attack of
 * the same note with no gap still jumps, which the pitch tracker can't see
 * (M5-02 review). The worklet feeds it render quanta; tests feed it signals.
 */
// The area file itself, not ENGINE_CONFIG: the worklet bundle stays this small.
import { timing } from '../../engine/config/timing';
import { createFft } from './fft';
import type { OnsetMessage } from './protocol';

export type OnsetDetectorOptions = {
  [K in keyof (typeof timing)['onset']]: number;
};

export interface OnsetDetector {
  readonly sampleRate: number;
  /**
   * Feeds consecutive samples, the first of them at `startTime` (seconds).
   * Returns the onsets found, each about one hop after it was heard: a peak
   * is picked once the next frame shows the flux falling.
   */
  push(samples: Float32Array, startTime: number): OnsetMessage[];
}

/** log(1 + γ·m): loud and quiet strokes get comparable flux, down to about −40 dBFS. */
const COMPRESSION = 10000;

/**
 * Where in the window an attack sits when its flux peaks, as a fraction of
 * the window back from its newest sample. The compressed magnitude rises
 * fastest while the attack is still near the window's rising edge; measured
 * on synthetic plucks (`onset-detector.test.ts`).
 */
const PEAK_LAG = 0.3;

export function createOnsetDetector(
  sampleRate: number,
  options: Partial<OnsetDetectorOptions> = {},
): OnsetDetector {
  const opts: OnsetDetectorOptions = { ...timing.onset, ...options };
  const size = opts.windowSize;
  const fft = createFft(size);
  const bins = size / 2;
  const hann = new Float32Array(size);
  for (let i = 0; i < size; i += 1) hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1));
  // A full-scale sine under a Hann window peaks at size/4.
  const scale = 4 / size;
  const norm = Math.log1p(COMPRESSION);
  // Only the guitar's band: noise in the bins above it would drown a note's attack.
  const binHz = sampleRate / size;
  const lowBin = Math.max(1, Math.floor(opts.minHz / binHz));
  const highBin = Math.min(bins, Math.max(lowBin + 1, Math.ceil(opts.maxHz / binHz)));

  const ring = new Float32Array(size);
  const frame = new Float32Array(size);
  const mags = new Float32Array(bins);
  // The compressed spectra of the last `diffFrames` frames, oldest first in ring order.
  const diffFrames = Math.max(1, Math.round(opts.diffFrames));
  const past = Array.from({ length: diffFrames }, () => new Float32Array(bins));
  let pastWrite = 0;
  let frames = 0;
  let write = 0;
  let filled = 0;
  let sinceHop = 0;

  const history: number[] = [];
  // The two frames before the current one: [flux, rms, time].
  let before: [number, number, number] | null = null;
  let candidate: [number, number, number] | null = null;
  let lastOnset = -Infinity;
  const refractory = opts.refractoryMs / 1000;
  const lag = (PEAK_LAG * size) / sampleRate;

  const median = (values: readonly number[]) => {
    const s = [...values].sort((a, b) => a - b);
    return s.length ? s[s.length >> 1]! : 0;
  };

  /** Flux and RMS of the window ending now. */
  const analyse = (): [number, number] => {
    let energy = 0;
    for (let i = 0; i < size; i += 1) {
      const v = ring[(write + i) % size]!;
      energy += v * v;
      frame[i] = v * hann[i]!;
    }
    fft.magnitudes(frame, mags);
    // Against the frame `diffFrames` back: an attack spreads over the hops a
    // window overlaps, and differencing across them sees all of it at once.
    const then = past[pastWrite]!;
    const primed = frames >= diffFrames;
    let flux = 0;
    for (let k = lowBin; k < highBin; k += 1) {
      const c = Math.log1p(COMPRESSION * mags[k]! * scale) / norm;
      if (primed) flux += Math.max(0, c - then[k]!);
      then[k] = c;
    }
    pastWrite = (pastWrite + 1) % diffFrames;
    frames += 1;
    return [flux / (highBin - lowBin), Math.sqrt(energy / size)];
  };

  return {
    sampleRate,
    push(samples, startTime) {
      const found: OnsetMessage[] = [];
      for (let i = 0; i < samples.length; i += 1) {
        ring[write] = samples[i]!;
        write = (write + 1) % size;
        if (filled < size) filled += 1;
        sinceHop += 1;
        if (sinceHop < opts.hopSize || filled < size) continue;
        sinceHop = 0;
        const time = startTime + (i + 1) / sampleRate;
        const [flux, rms] = analyse();
        // Is the previous frame a peak above the threshold of the frames before it?
        // Not before the median has a full history: the first frames of input aren't onsets.
        if (candidate && before && history.length >= opts.medianFrames) {
          const [cFlux, cRms, cTime] = candidate;
          const threshold = opts.thresholdFloor + opts.thresholdRatio * median(history);
          const peak = cFlux > threshold && cFlux >= before[0] && cFlux > flux;
          if (peak && cRms >= opts.minRms && cTime - lastOnset >= refractory) {
            lastOnset = cTime;
            found.push({ time: cTime - lag, strength: cFlux });
          }
        }
        if (before) {
          history.push(before[0]);
          if (history.length > opts.medianFrames) history.shift();
        }
        before = candidate;
        candidate = [flux, rms, time];
      }
      return found;
    },
  };
}
