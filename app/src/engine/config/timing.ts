/**
 * The M8-01 timing engine (design §12): the on-time windows that turn onset
 * offsets into an FSRS rating (§3.2 shape), the tap-to-click calibration, the
 * click-fade ladder D31 climbs, and the mic onset detector.
 */
export const timing = {
  grade: {
    /**
     * An onset within ±this many ms of its target counts as on time
     * (design §12: about ±30–50ms). Outside it, or missed, it is wrong.
     */
    onTimeMs: 50,
    /** Fewer on-time onsets than this share is wrong: Again. */
    passRate: 0.8,
    /** Correct, but the median |offset| is above this: Hard (the "slow" answer). */
    targetMs: 30,
    /** Correct with the median |offset| at or under this: Easy (fluent). */
    fluentMs: 15,
    /**
     * Onsets further than this from every target are stray taps, not late
     * ones; each counts against the on-time share. Capped at half the gap
     * between neighbouring targets, so one tap never serves two.
     */
    matchMs: 150,
  },
  calibration: {
    /** A steady, mid-range tempo: easy to lock on to. */
    bpm: 100,
    /** Clicks to tap along with after the count-in: 16 at 100 BPM is about 10s. */
    clicks: 16,
    /** The first taps after the count-in settle the learner in and aren't counted. */
    warmupClicks: 2,
    /** A tap further than this from its click is a miss, not an offset. */
    matchMs: 200,
    /** Tukey fences: offsets more than this many IQRs outside the quartiles are trimmed. */
    outlierIqr: 1.5,
    /** A run needs this many usable taps to count. */
    minSamples: 8,
    /** Taps spread wider than this (IQR, ms) are too uneven to trust: try again. */
    maxSpreadMs: 60,
  },
  fade: {
    /** Over the last few bars, at or above this on-time share: drop more of the click. */
    promoteAt: 0.9,
    /** Below this: bring the click back a step (research/02 rule 5: hold 80–90%). */
    demoteBelow: 0.75,
  },
  onset: {
    /** FFT window, in samples (a power of two): ~11ms at 48 kHz. */
    windowSize: 512,
    /** A new spectral frame every this many samples: one render quantum, ~2.7ms. */
    hopSize: 128,
    /**
     * Flux compares each frame with the one this many hops back. An attack
     * spreads over the hops a window overlaps; two hops sees more of it than
     * one, yet still places it within a hop or so (onset-detector.test.ts).
     */
    diffFrames: 2,
    /** Flux is summed over this band, in Hz: a guitar's fundamentals and the harmonics that carry its attack. */
    minHz: 60,
    maxHz: 5000,
    /** Frames quieter than this RMS (full scale = 1, about −54 dBFS) never start an onset. */
    minRms: 0.002,
    /** Flux must exceed this multiple of the recent median flux… (1.5 let loud room noise through) */
    thresholdRatio: 2,
    /** …and by this much absolutely (normalised flux), so silence plus a cough isn't a strum. */
    thresholdFloor: 0.02,
    /** The median runs over this many past frames (~80ms). */
    medianFrames: 30,
    /**
     * After an onset, ignore others for this long. A strum spreads six strings
     * over 25–40ms (audio/config.ts `strum.gap`); it is one onset.
     */
    refractoryMs: 60,
  },
} as const;

declare module './index' {
  interface EngineConfig {
    timing: typeof timing;
  }
}
