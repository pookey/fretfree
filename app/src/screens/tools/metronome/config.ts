/**
 * Every metronome tunable (design §7 Tools). Change values here, not inline.
 * The metronome grades nothing, so these live with it rather than in
 * `engine/config`, and load only with its lazy view.
 */
export const METRONOME_CONFIG = {
  /** The slowest and fastest tempo, in pulses per minute. */
  minBpm: 30,
  maxBpm: 250,
  /** The tempo a first visit starts at. */
  defaultBpm: 100,
  /** The ± buttons: a fine and a coarse step, in BPM. */
  steps: [1, 5],
  tapTempo: {
    /** A tap this long after the last one (ms) starts a new count. Above 2000 ms, so 30 BPM can be tapped. */
    resetMs: 2500,
    /** The tempo is the median interval of at most this many recent taps. */
    maxTaps: 8,
  },
  /** How often (ms) a running, unpinned click checks that the learner is still in Tools. */
  routeCheckMs: 250,
} as const;
