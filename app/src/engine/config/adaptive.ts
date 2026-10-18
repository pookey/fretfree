export const adaptive = {
  window: 20,
  /** Decisions need at least this many answers in the window. */
  minAnswers: 10,
  widenAbove: 0.92,
  narrowBelow: 0.75,
} as const;

declare module './index' {
  interface EngineConfig {
    adaptive: typeof adaptive;
  }
}
