/**
 * Audio tunables (design §9). They shape the sound, not the learning engine,
 * so they live here rather than in `engine/config`.
 */
export const AUDIO = {
  /** Default output level, 0–1, until settings say otherwise. */
  defaultVolume: 0.8,
  /** Plucked voices, one per guitar string, so a strum rings like six strings. */
  voices: 6,
  /** Karplus–Strong pluck (Tone `PluckSynth`): noise burst into a damped comb filter. */
  pluck: {
    /** Length of the noise burst, in periods of the note. */
    attackNoise: 1.2,
    /** Comb-filter lowpass (Hz). Lower is a darker, rounder string. */
    dampening: 3800,
    /** Feedback, 0–1. Higher rings longer. */
    resonance: 0.97,
    /** Seconds for a released string to die away. */
    release: 0.9,
  },
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
