export const earFind = {
  /**
   * D15 plays the open string, then the note to find, 450ms apart (audio
   * `notes.gap`), as the prompt appears. Answering by ear means hearing the
   * note first, which a tap target's speed calibration doesn't include
   * (research/02 rule 3), so this much is taken off the response time
   * before grading when the note isn't named.
   */
  listenAllowanceMs: 1000,
} as const;

declare module './index' {
  interface EngineConfig {
    earFind: typeof earFind;
  }
}
