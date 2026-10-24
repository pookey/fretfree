/**
 * Which answers count as evidence of speed. A drill graded on timing
 * against a click (`DrillLogic.rating`) logs its timing error as
 * `responseMs`, not how long the answer took, so speed measures across
 * drills (the speed-demon achievement, the faster-session celebration)
 * leave its reviews out.
 */
export const speed = {
  /** Drill IDs graded on onset timing: D20 "Tap and strum rhythm", D31 "Accent and strum in meter". */
  timingDrills: ['tap-strum-rhythm', 'accent-strum'] as readonly string[],
} as const;

declare module './index' {
  interface EngineConfig {
    speed: typeof speed;
  }
}
