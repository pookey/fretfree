import { beforeEach, describe, expect, it, vi } from 'vitest';

const triggerAttackRelease = vi.fn();
const start = vi.fn(async () => undefined);
vi.mock('tone', () => ({
  start,
  now: () => 10,
  Synth: class {},
  PolySynth: class {
    volume = { value: 0 };
    triggerAttackRelease = triggerAttackRelease;
    toDestination() {
      return this;
    }
  },
}));

beforeEach(() => {
  vi.resetModules();
  triggerAttackRelease.mockClear();
  start.mockClear();
});

describe('audio', () => {
  it('converts volume to decibels', async () => {
    const { volumeToDb } = await import('./audio');
    expect(volumeToDb(1)).toBe(0);
    expect(volumeToDb(0)).toBe(-Infinity);
    expect(volumeToDb(0.5)).toBeCloseTo(-6.02, 1);
    expect(volumeToDb(2)).toBe(0);
  });

  it('stays silent until unlocked, then plays notes in sequence', async () => {
    const audio = await import('./audio');
    await audio.playNotes(['A2']);
    expect(triggerAttackRelease).not.toHaveBeenCalled();
    await audio.unlockAudio();
    await audio.unlockAudio();
    expect(start).toHaveBeenCalledTimes(1);
    expect(audio.isAudioUnlocked()).toBe(true);
    await audio.playNotes(['A2', 'E3'], { gap: 0.5 });
    expect(triggerAttackRelease).toHaveBeenNthCalledWith(1, 'A2', 0.9, 10);
    expect(triggerAttackRelease).toHaveBeenNthCalledWith(2, 'E3', 0.9, 10.5);
  });

  it('respects mute', async () => {
    const audio = await import('./audio');
    await audio.unlockAudio();
    await audio.playNotes(['A2'], { muted: true });
    expect(triggerAttackRelease).not.toHaveBeenCalled();
  });

  it('unlocks on the first interaction only', async () => {
    const audio = await import('./audio');
    const target = new EventTarget() as unknown as Document;
    audio.installAudioUnlock(target);
    target.dispatchEvent(new Event('pointerdown'));
    target.dispatchEvent(new Event('pointerdown'));
    await vi.waitFor(() => expect(start).toHaveBeenCalledTimes(1));
  });
});
