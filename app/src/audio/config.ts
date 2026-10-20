/**
 * Audio tunables (design §9). They shape the sound, not the learning engine,
 * so they live here rather than in `engine/config`.
 */
export const AUDIO = {
  /** Default output level, 0–1, until settings say otherwise. */
  defaultVolume: 0.8,
  /** Plucked voices, one per guitar string, so a strum rings like six strings. */
  voices: 6,
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
