export const quickDrills = {
  /** The Today fretboard warm-up's time budget (design §7 Today: "2-minute fretboard warm-up"). */
  warmupMinutes: 2,
  /** Topics the warm-up draws on: notes and shapes on the neck, not F1's note-wheel theory. */
  warmupTopics: ['F2', 'F3', 'C1', 'C2'],
} as const;

declare module './index' {
  interface EngineConfig {
    quickDrills: typeof quickDrills;
  }
}
