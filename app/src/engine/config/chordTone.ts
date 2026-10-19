export const chordTone = {
  /**
   * D8 draws the shape's roots as squares from this guide level up (design
   * §3.5: levels 2–3 highlight the roots), except when the root is the note
   * to tap.
   */
  rootGuideLevel: 2,
  /**
   * Compact screens show at least this many frets round the shape. Every D8
   * shape spans at most four frets in standard tuning, so it fits with a
   * fret to spare.
   */
  compactWindowFrets: 5,
} as const;

declare module './index' {
  interface EngineConfig {
    chordTone: typeof chordTone;
  }
}
