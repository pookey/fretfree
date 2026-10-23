/**
 * Audio tunables (design §9). They shape the sound, not the learning engine,
 * so they live here rather than in `engine/config`.
 */
export const AUDIO = {
  /** Default output level, 0–1, until settings say otherwise. */
  defaultVolume: 0.8,
  /** Plucked voices, one per guitar string, so a strum rings like six strings. */
  voices: 6,
  /**
   * Recorded nylon guitar (M4-15): FluidR3 GM, one MP3 per note in
   * `public/samples/nylon/<midi>.mp3`, fetched by `scripts/fetch-samples.mjs`.
   * A note plays on the plucked voice below until its sample has decoded.
   */
  samples: {
    path: 'samples/nylon/',
    /** MIDI range shipped: E2 to E6, the open low E to fret 24 on the high E. */
    low: 40,
    high: 88,
    /** The rendered samples peak near 0.125: this lifts them to the plucked voice's loudness. */
    gain: 1.3,
    /** Seconds for a released sample to fade. */
    release: 0.3,
  },
  /** How hard a string is played, so a strum isn't six identical notes. */
  dynamics: {
    /** Level of the softest note, against 1 for the hardest. */
    floor: 0.6,
    /** A strummed string's velocity, 0–1, is drawn from this range. */
    strumVelocity: [0.75, 1],
    /** An up-stroke is played lighter by this much. */
    upStroke: 0.15,
    /** Each gap between strings in a strum varies by up to this fraction. */
    gapJitter: 0.25,
    /** Chords of more notes than this are turned down, by √(this / notes). */
    chordNotes: 2.5,
  },
  /** A gentle limiter on the whole guitar, so a full strum never clips. */
  limiter: { threshold: -4, knee: 4, ratio: 8, attack: 0.003, release: 0.15 },
  /** Karplus–Strong pluck (`pluck.ts`), rendered once per note into a buffer. */
  pluck: {
    /** Seconds rendered per note. A string has died away by then, so longer notes just end. */
    seconds: 2.6,
    /** Seconds for the fundamental to fall 60 dB. Longer rings longer. */
    t60: 1.6,
    /** 0–1: how much of the pick's noise burst gets through. Lower is darker and rounder. */
    brightness: 0.55,
    /** Peak level of one note, 0–1, leaving headroom for six strings at once. */
    peak: 0.45,
    /** Seconds for a released string to die away. */
    release: 0.9,
  },
  /** Rendered notes kept for reuse (about 0.5 MB each); the least recently played go first. */
  cachedNotes: 24,
  /** A gentle lowpass on the whole guitar that takes the edge off the pick noise (Hz). */
  toneHz: 5000,
  notes: {
    /** Seconds a single played note rings before release. */
    duration: 1.1,
    /** Seconds between successive notes in `playNotes`. */
    gap: 0.45,
  },
  strum: {
    /** Seconds between neighbouring strings in a strum (a relaxed hand: 25–40ms). */
    gap: 0.03,
    /** Seconds a one-off strummed chord rings before release. */
    duration: 2.2,
    /** An up-stroke catches only the top strings, like a real strum. */
    upStrings: 4,
  },
  progression: {
    bpm: 80,
    beatsPerChord: 4,
    /** Seconds of lead-in before the Transport's first beat, so the first strum isn't clipped. */
    leadIn: 0.08,
  },
} as const;
