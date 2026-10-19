export const playSequence = {
  /**
   * D17's detection delay, taken off the response time before it is graded:
   * the detector's window (~45ms) plus the 80ms stability hold (design §9), so
   * the last note is not graded slower than it was played (M5-02 review).
   */
  micLatencyMs: 150,
  /**
   * After a wrong answer the session plays the expected sequence. D17 ignores
   * notes that start while it plays, so the speaker can't answer for the
   * learner. Session playback spaces notes 450ms apart, each ringing 0.9s
   * with a 0.8s release (audio/audio.ts).
   */
  playbackGapMs: 450,
  playbackTailMs: 1700,
  /** Each prompt's root goes on one of these frets, so the fingering is a movable shape. */
  rootFrets: { from: 1, to: 12 },
  /** The fingering's hand position: from a fret below the root to this many frets above it. */
  handAbove: 3,
  /** The highest fret a fingering may use. */
  maxFret: 15,
} as const;

declare module './index' {
  interface EngineConfig {
    playSequence: typeof playSequence;
  }
}
