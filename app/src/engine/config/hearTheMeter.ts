/** D30 "Hear the meter" (T4, T7; design §12). */
export const hearTheMeter = {
  /**
   * Tempo ranges, in eighth notes per minute, drawn per prompt (research/02
   * rule 12). They overlap where meters share a bar (3/4 and 6/8 are both
   * six eighths), so the speed of the notes is never the clue: only where
   * the beats fall is. As felt beats: 3/4 at ♩ = 84–120, 6/8 at ♩. = 52–72,
   * 12/8 at ♩. = 50–66, 5/4 at ♩ = 96–132.
   */
  eighthsPerMinute: {
    '3/4': { from: 168, to: 240 },
    '4/4': { from: 160, to: 240 },
    '6/8': { from: 156, to: 216 },
    '12/8': { from: 150, to: 198 },
    '5/4': { from: 192, to: 264 },
    '7/8': { from: 196, to: 252 },
  },
  /** Tempos are drawn in steps of this many eighths per minute. */
  tempoStep: 4,
  /**
   * The clip's length: whole bars, at least `minBars` and enough for
   * `minSeconds`, but at most `maxBars`. A meter needs a couple of bars to be
   * heard returning to its downbeat.
   */
  minBars: 2,
  maxBars: 4,
  minSeconds: 6,
  /**
   * Milliseconds the learner needs, after the clip's last bar ends, before
   * graded time starts (design §3.2): the clip's length is listening, not
   * recall, as in D14.
   */
  listenMs: 600,
  /**
   * How long a right answer's feedback stays (ms): long enough to see the
   * time signature and the counting, the visual beside the sound and the
   * name (research/02 rule 10).
   */
  feedbackHoldMs: 2500,
} as const;

declare module './index' {
  interface EngineConfig {
    hearTheMeter: typeof hearTheMeter;
  }
}
