export const guides = {
  maxLevel: 3,
  /** Fade one level when rolling accuracy is at least this and speed is on target. */
  fadeAtAccuracy: 0.9,
  /** Restore one level when rolling accuracy falls below this. */
  restoreBelowAccuracy: 0.7,
  /** Within a session: fade one level after this many consecutive fluent answers. */
  fadeAfterFluent: 5,
  /** Within a session: restore one level after this many consecutive errors. */
  restoreAfterErrors: 2,
} as const;

declare module './index' {
  interface EngineConfig {
    guides: typeof guides;
  }
}
