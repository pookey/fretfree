export const voiceLeading = {
  /**
   * D19 labels the starting triad's notes with their names at this guide
   * level and above, in a worked example, and after an answer (rule 9:
   * which note is which fades with the guides).
   */
  noteNamesGuideLevel: 2,
  /**
   * D19's hint line states the rule ("hold the shared note, move the others
   * to the nearest note") at this guide level and above.
   */
  ruleGuideLevel: 1,
  /** D19's context panel spells each chord of the key at this guide level and above. */
  spellingGuideLevel: 2,
  /**
   * Compact screens show at least this many frets, centred on the starting
   * triad, and always 2 frets either side of it: the nearest voicing (each
   * note at most 2 frets away) fits, and the window never shows which way it
   * lies.
   */
  compactWindowFrets: 7,
} as const;

declare module './index' {
  interface EngineConfig {
    voiceLeading: typeof voiceLeading;
  }
}
