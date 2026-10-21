import type { PitchSourceErrorReason } from '../../mic/types';

/**
 * What the mic drills (D16, D17) say about the mic, in one vocabulary (copy
 * audit, drills §2 item 10): each problem names its fix, and the idle line
 * says nothing is recorded or sent (design §9).
 */
export const MIC_COPY = {
  idle: 'Play it on your guitar. FretFree listens through the mic; nothing is recorded or sent.',
  start: 'Start listening',
  starting: 'Starting the mic…',
  listening: 'Listening…',
  retry: 'Try again',
} as const;

/** What to say when the mic can't start or stops, by reason. */
export const MIC_PROBLEM: Record<PitchSourceErrorReason, string> = {
  denied:
    "FretFree can't use the mic. Allow the microphone for this site in your browser's settings, then try again.",
  unsupported: "This browser can't listen to your guitar. Try Safari on iPad, or Chrome.",
  'no-device': 'No microphone was found. Connect one, then try again.',
  failed: "The mic didn't start. Try again.",
  lost: 'The mic stopped: it was unplugged, another app took it, or FretFree went to the background. Try again.',
};
