import { beforeEach, describe, expect, it, vi } from 'vitest';
import { playNotes, playProgression, stopAudio, strum } from '../../audio/audio';
import { playClip, stopClip } from './play';

vi.mock('../../audio/audio', () => ({
  playNotes: vi.fn(() => Promise.resolve()),
  strum: vi.fn(() => Promise.resolve()),
  playProgression: vi.fn(() => Promise.resolve({ started: true })),
  stopAudio: vi.fn(),
}));

beforeEach(() => vi.clearAllMocks());

describe('playClip', () => {
  it('cuts off what was sounding, then plays notes apart or together', async () => {
    await playClip({ type: 'notes', notes: ['C3', 'E3'], gap: 0.8 });
    expect(stopAudio).toHaveBeenCalledTimes(1);
    expect(playNotes).toHaveBeenCalledWith(['C3', 'E3'], { gap: 0.8, duration: 1.4 });
  });

  it('strums a chord', async () => {
    await playClip({ type: 'strum', notes: ['E2', 'B2', 'E3', 'G3'] });
    expect(strum).toHaveBeenCalledWith(['E2', 'B2', 'E3', 'G3']);
  });

  it('plays a progression one strum per chord', async () => {
    await playClip({ type: 'progression', chords: [['C3'], ['G2']], bpm: 96, beatsPerChord: 2 });
    expect(playProgression).toHaveBeenCalledWith([{ notes: ['C3'] }, { notes: ['G2'] }], {
      bpm: 96,
      beatsPerChord: 2,
      pattern: 'once',
    });
  });

  it('stops a clip when the prompt goes', () => {
    stopClip();
    expect(stopAudio).toHaveBeenCalledTimes(1);
  });
});
