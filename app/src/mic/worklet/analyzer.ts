import { PitchDetector } from 'pitchy';
import { DETECTOR_CONFIG } from './config';
import type { PitchMessage } from './protocol';

export interface PitchAnalyzerOptions {
  minWindowMs: number;
  hopMs: number;
  minRms: number;
  peakThreshold: number;
}

/**
 * Pure and clock-free: slides a window over the incoming samples and runs
 * pitchy every hop. The worklet feeds it 128-sample render quanta; tests feed
 * it synthetic signals.
 */
export interface PitchAnalyzer {
  readonly sampleRate: number;
  readonly windowSize: number;
  readonly hopSize: number;
  /**
   * Feeds consecutive samples, the first of them at `startTime` (seconds).
   * Returns one frame per hop completed, once the window has filled.
   */
  push(samples: Float32Array, startTime: number): PitchMessage[];
}

/** The smallest power of two ≥ `n`. */
function ceilPow2(n: number): number {
  return 2 ** Math.ceil(Math.log2(n));
}

export function createPitchAnalyzer(
  sampleRate: number,
  options: Partial<PitchAnalyzerOptions> = {},
): PitchAnalyzer {
  const opts: PitchAnalyzerOptions = { ...DETECTOR_CONFIG, ...options };
  const windowSize = ceilPow2((sampleRate * opts.minWindowMs) / 1000);
  const hopSize = Math.max(1, Math.round((sampleRate * opts.hopMs) / 1000));
  // Below two periods per window the NSDF is computed from too few samples:
  // white noise scores clarity ~1 there (about 23 Hz at 48 kHz).
  const lowestFrequency = (2 * sampleRate) / windowSize;
  const detector = PitchDetector.forFloat32Array(windowSize);
  detector.clarityThreshold = opts.peakThreshold;
  detector.minVolumeAbsolute = opts.minRms;

  // A ring buffer of the latest `windowSize` samples, unrolled into `window` per hop.
  const ring = new Float32Array(windowSize);
  const window = new Float32Array(windowSize);
  let write = 0;
  let filled = 0;
  let sinceHop = 0;

  const analyse = (time: number): PitchMessage => {
    window.set(ring.subarray(write));
    window.set(ring.subarray(0, write), windowSize - write);
    // [0, 0] below `minRms` or when no NSDF peak exists.
    const [frequency, clarity] = detector.findPitch(window, sampleRate);
    return frequency >= lowestFrequency
      ? { frequency, clarity, time }
      : { frequency: 0, clarity: 0, time };
  };

  return {
    sampleRate,
    windowSize,
    hopSize,
    push(samples, startTime) {
      const frames: PitchMessage[] = [];
      for (let i = 0; i < samples.length; i += 1) {
        ring[write] = samples[i] as number;
        write = (write + 1) % windowSize;
        if (filled < windowSize) filled += 1;
        sinceHop += 1;
        if (sinceHop >= hopSize && filled === windowSize) {
          sinceHop = 0;
          frames.push(analyse(startTime + (i + 1) / sampleRate));
        }
      }
      return frames;
    },
  };
}
