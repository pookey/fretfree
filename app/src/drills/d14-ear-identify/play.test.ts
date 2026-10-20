import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isAudioUnlocked,
  loadTone,
  playNotes,
  playProgression,
  stopAudio,
  strum,
} from '../../audio/audio';
import type { D14Clip } from './logic';
import { playClip, stopClip } from './play';

vi.mock('../../audio/audio', () => ({
  isAudioUnlocked: vi.fn(() => true),
  loadTone: vi.fn(() => Promise.resolve({})),
  playNotes: vi.fn(() => Promise.resolve()),
  strum: vi.fn(() => Promise.resolve()),
  playProgression: vi.fn(() => Promise.resolve({ started: true })),
  stopAudio: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isAudioUnlocked).mockReturnValue(true);
});

const rising: D14Clip = { type: 'notes', notes: ['C3', 'E3'], gap: 0.8 };
const minor: D14Clip = { type: 'strum', notes: ['E2', 'B2', 'E3', 'G3'] };

describe('playClip', () => {
  it('cuts off what was sounding, then plays notes apart or together', async () => {
    await playClip(rising);
    expect(stopAudio).toHaveBeenCalledTimes(1);
    expect(playNotes).toHaveBeenCalledWith(['C3', 'E3'], { gap: 0.8, duration: 1.4 });
  });

  it('strums a chord', async () => {
    await playClip(minor);
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

  it('drops a clip overtaken by another while Tone loads (a new prompt, a remount)', async () => {
    let loaded!: () => void;
    vi.mocked(loadTone).mockReturnValueOnce(
      new Promise((resolve) => (loaded = () => resolve({} as never))),
    );
    const first = playClip(rising);
    const second = playClip(minor);
    loaded();
    await Promise.all([first, second]);
    expect(playNotes).not.toHaveBeenCalled();
    expect(strum).toHaveBeenCalledTimes(1);
  });

  it('drops a clip still waiting when the prompt goes', async () => {
    const pending = playClip(minor);
    stopClip();
    await pending;
    expect(strum).not.toHaveBeenCalled();
    expect(stopAudio).toHaveBeenCalledTimes(2);
  });

  it('leaves Tone unloaded before the first tap, and still drops a clip replaced at once', async () => {
    vi.mocked(isAudioUnlocked).mockReturnValue(false);
    const first = playClip(rising);
    const second = playClip(minor);
    await Promise.all([first, second]);
    expect(loadTone).not.toHaveBeenCalled();
    expect(playNotes).not.toHaveBeenCalled();
    // The audio module waits on a tap's unlock under way, or stays silent.
    expect(strum).toHaveBeenCalledTimes(1);
  });
});
