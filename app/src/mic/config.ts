import type { NoteTrackerOptions } from './types';

/** Every mic tunable (design §9). Change values here, not inline. */
export const MIC_CONFIG = {
  /** Concert pitch, in Hz. */
  a4: 440,
  tracker: {
    minStableMs: 80,
    minClarity: 0.9,
    // Low B on a 7-string is ~62 Hz; the 24th fret of high E is ~1319 Hz.
    minFrequency: 60,
    maxFrequency: 1500,
    holdCents: 65,
    dropoutMs: 50,
  } satisfies NoteTrackerOptions,
  /** The fake source's frame period; about one 1024-sample pitchy window at 44.1 kHz. */
  fakeFrameMs: 20,
} as const;
