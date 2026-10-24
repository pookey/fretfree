export const formReading = {
  /**
   * The form-reading drill plays a tune in the order it is read, once the
   * learner has answered (research/02 rule 10): this many quarter notes a
   * minute, slow enough to follow the bars lighting up in turn.
   */
  quartersPerMinute: 104,
} as const;

declare module './index' {
  interface EngineConfig {
    formReading: typeof formReading;
  }
}
