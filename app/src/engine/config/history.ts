export const history = {
  /** The practice calendar shows at most this many weeks, newest last. */
  calendarWeeks: 12,
  /** The calendar never shows fewer weeks than this, so a first week isn't a lone row. */
  calendarMinWeeks: 4,
  /** "Coming up" counts reviews due on each of the next N days, today included. */
  dueForecastDays: 7,
  /** "If you stopped today" predicts recall this many days ahead. */
  recallHorizonDays: 30,
} as const;

declare module './index' {
  interface EngineConfig {
    history: typeof history;
  }
}
