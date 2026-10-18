export const grading = {
  /** Correct answers slower than baseline + targetDeltaMs are graded Hard. */
  targetDeltaMs: 2000,
  /** Correct answers at or under baseline + fluentDeltaMs are graded Easy. */
  fluentDeltaMs: 1000,
  /** Used until the onboarding latency calibration has run. */
  defaultBaselineMs: 700,
} as const;

declare module './index' {
  interface EngineConfig {
    grading: typeof grading;
  }
}
