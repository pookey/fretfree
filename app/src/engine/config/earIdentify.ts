/** D14 "Hear it → identify" (I6, design §6 D14). */
export const earIdentify = {
  /**
   * Milliseconds the learner needs, after the clip's last sound starts, to
   * have heard it. Graded time starts there (design §3.2): the clip's own
   * length is listening, not recall, so a 5-second progression isn't
   * graded Hard for being long.
   */
  listenMs: 600,
  /** Seconds between the two notes of a rising or falling interval. */
  intervalGapS: 0.8,
  /** Seconds each note of an interval rings. */
  noteS: 1.4,
  /**
   * The lowest note of an interval, as MIDI, from C3 to C4. The root varies
   * per prompt (research/02 rule 12) inside a range a guitar plays easily.
   */
  intervalLow: { from: 48, to: 60 },
  /** A chord's root (its bass note), as MIDI: E2 to E3, string 6 or 5. */
  chordRoot: { from: 40, to: 52 },
  /** Progressions: one strum per chord, at this tempo and length. */
  progression: { bpm: 96, beatsPerChord: 2 },
} as const;

declare module './index' {
  interface EngineConfig {
    earIdentify: typeof earIdentify;
  }
}
