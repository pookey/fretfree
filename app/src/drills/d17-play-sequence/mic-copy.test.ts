import { describe, expect, it } from 'vitest';
import { MIC_COPY, MIC_PROBLEM } from './mic-copy';

describe('mic copy', () => {
  it('says nothing is recorded or sent', () => {
    expect(MIC_COPY.idle).toBe(
      'Play it on your guitar. FretFree listens through the mic; nothing is recorded or sent.',
    );
    expect(MIC_COPY.starting).toBe('Starting the mic…');
  });

  it('names the fix for each problem', () => {
    expect(MIC_PROBLEM.denied).toBe(
      "FretFree can't use the mic. Allow the microphone for this site in your browser's settings, then try again.",
    );
    expect(MIC_PROBLEM.unsupported).toBe(
      "This browser can't listen to your guitar. Try Safari on iPad, or Chrome.",
    );
    for (const reason of ['denied', 'no-device', 'failed', 'lost'] as const) {
      expect(MIC_PROBLEM[reason]).toMatch(/try again\.$/i);
    }
  });
});
