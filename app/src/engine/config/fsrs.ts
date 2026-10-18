export const fsrs = {
  requestRetention: 0.9,
  maximumIntervalDays: 365,
  /** Placement-test "already known" items are seeded at this stability. */
  seededStabilityDays: 10,
} as const;

declare module './index' {
  interface EngineConfig {
    fsrs: typeof fsrs;
  }
}
