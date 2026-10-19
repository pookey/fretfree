import type { NoteTrackerOptions } from '../types';

/**
 * Tunables for the pitchy analysis that runs in the AudioWorklet (design §9).
 * The note tracker's thresholds live in `MIC_CONFIG.tracker`.
 */
export const DETECTOR_CONFIG = {
  /**
   * Shortest analysis window, in ms; rounded up to a power-of-two sample count
   * (2048 at 44.1 and 48 kHz). The McLeod method needs about two periods of the
   * lowest note: low B on a 7-string (~62 Hz) has a 16ms period.
   */
  minWindowMs: 40,
  /**
   * A new frame every this many ms, overlapping the previous window. One
   * 2048-sample analysis costs about 1ms of audio-thread time on a laptop, so
   * 20ms keeps the worklet light while giving the tracker four frames per 80ms.
   */
  hopMs: 20,
  /**
   * Windows quieter than this RMS (full scale = 1) are reported unvoiced
   * without analysis, about −54 dBFS. Room noise has no stable pitch, so this
   * only saves work; clarity does the real voicing decision.
   */
  minRms: 0.002,
  /** pitchy's McLeod `k`: the first NSDF peak within this fraction of the highest wins. */
  peakThreshold: 0.9,
} as const;

/**
 * Tracker settings for this detector, over `MIC_CONFIG.tracker`. Its frames
 * overlap (a ~43ms window every 20ms), so a blip of d ms in a sustained note
 * spoils every window that contains it: up to d + 63ms between clear frames.
 * The contract's 50ms dropout would split a note on a 10ms blip.
 */
export const DETECTOR_TRACKER = {
  dropoutMs: 100,
} as const satisfies Partial<NoteTrackerOptions>;
