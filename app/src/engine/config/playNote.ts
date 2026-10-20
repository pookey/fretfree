export const playNote = {
  /**
   * D16 answers arrive once the detector calls a note stable: about 45ms of
   * analysis window plus the 80ms hold (design §9), so ~125–150ms after the
   * pluck. That much is taken off the response time before grading.
   */
  micLatencyMs: 150,
  /**
   * Fretting and plucking a string takes longer than tapping a screen, which
   * is what the speed targets are calibrated on (research/02 rule 3). Until a
   * mic baseline is measured, D16 allows this much extra before grading.
   */
  playAllowanceMs: 1000,
  /**
   * A note that takes over from one still ringing from before the prompt,
   * within this long of its last frame and an octave away, is the old string
   * decaying onto an octave (a detector artefact), not a new pluck. Covers the
   * real detector's 100ms dropout (M5-02).
   */
  takeoverGapMs: 100,
  /**
   * After a wrong answer the session plays the right note, then the one
   * played. D16 ignores notes that start while they sound, so the speaker
   * can't answer the next prompt. Session playback spaces notes 450ms apart,
   * each ringing 1.1s with a 0.9s release (audio/config.ts).
   */
  playbackGapMs: 450,
  playbackTailMs: 2000,
} as const;

declare module './index' {
  interface EngineConfig {
    playNote: typeof playNote;
  }
}
