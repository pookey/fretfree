// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getAudioOutput,
  isAudioUnlocked,
  loadTone,
  playProgression,
  stopAudio,
  unlockAudio,
} from '../../audio/audio';
import type { D30Clip } from './logic';
import { playClip, stopClip } from './play';

vi.mock('../../audio/audio', () => ({
  getAudioOutput: vi.fn(() => ({ volume: 0.8, muted: false })),
  isAudioUnlocked: vi.fn(() => true),
  loadTone: vi.fn(),
  playProgression: vi.fn(() => Promise.resolve({ started: true })),
  stopAudio: vi.fn(),
  unlockAudio: vi.fn(() => Promise.resolve()),
  volumeToDb: vi.fn(() => -2),
}));

/** A stand-in for Tone: every node records its triggers and disposal. */
function fakeTone() {
  const nodes: { kind: string; triggers: unknown[][]; disposed: boolean }[] = [];
  const node = (kind: string) =>
    class {
      triggers: unknown[][] = [];
      disposed = false;
      volume = { value: 0, rampTo: vi.fn() };
      constructor() {
        nodes.push(this as never);
        (this as unknown as { kind: string }).kind = kind;
      }
      connect() {
        return this;
      }
      toDestination() {
        return this;
      }
      triggerAttackRelease(...args: unknown[]) {
        this.triggers.push(args);
      }
      dispose() {
        this.disposed = true;
      }
    };
  const Tone = {
    now: () => 10,
    Volume: node('volume'),
    MembraneSynth: node('kick'),
    NoiseSynth: node('noise'),
    Filter: node('filter'),
  };
  return { Tone, nodes };
}

const strum: D30Clip = {
  style: 'strum',
  eighthsPerMinute: 180,
  strokes: [
    { notes: ['E2', 'G#3'], eighths: 1 },
    { notes: ['B3'], eighths: 4 },
  ],
};

const drums: D30Clip = {
  style: 'drums',
  eighthsPerMinute: 120,
  hits: [
    { at: 0, drum: 'kick', velocity: 1 },
    { at: 0, drum: 'hat', velocity: 1 },
    { at: 1, drum: 'hat', velocity: 0.4 },
    { at: 2, drum: 'snare', velocity: 1 },
  ],
  length: 6,
};

let tone: ReturnType<typeof fakeTone>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  tone = fakeTone();
  vi.mocked(loadTone).mockResolvedValue(tone.Tone as never);
  vi.mocked(isAudioUnlocked).mockReturnValue(true);
  vi.mocked(getAudioOutput).mockReturnValue({ volume: 0.8, muted: false });
});

afterEach(() => {
  stopClip();
  vi.useRealTimers();
});

describe('playClip', () => {
  it('strums through the progression player, an eighth to a beat', async () => {
    await playClip(strum);
    expect(stopAudio).toHaveBeenCalled();
    expect(playProgression).toHaveBeenCalledWith(
      [
        { notes: ['E2', 'G#3'], beats: 1 },
        { notes: ['B3'], beats: 4 },
      ],
      { bpm: 180, pattern: 'once' },
    );
  });

  it('drums on the audio clock, an eighth apart, then lets go of the kit', async () => {
    await playClip(drums);
    const kick = tone.nodes.find((n) => n.kind === 'kick')!;
    const [snare, hat] = tone.nodes.filter((n) => n.kind === 'noise');
    // Half a second an eighth at 120, after the lead-in.
    expect(kick.triggers).toEqual([['C1', 0.3, 10.08, 1]]);
    expect(snare!.triggers.map((t) => t[1])).toEqual([11.08]);
    expect(hat!.triggers.map((t) => [t[1], t[2]])).toEqual([
      [10.08, 1],
      [10.58, 0.4],
    ]);
    expect(tone.nodes.some((n) => n.disposed)).toBe(false);
    vi.advanceTimersByTime(4000);
    expect(tone.nodes.every((n) => n.disposed)).toBe(true);
  });

  it('cuts drums off when stopped or replaced', async () => {
    await playClip(drums);
    stopClip();
    vi.advanceTimersByTime(100);
    expect(tone.nodes.every((n) => n.disposed)).toBe(true);
    const before = tone.nodes.length;
    await playClip(drums);
    await playClip(strum);
    vi.advanceTimersByTime(100);
    expect(tone.nodes.slice(before).every((n) => n.disposed)).toBe(true);
  });

  it('plays no drums in silent mode', async () => {
    vi.mocked(getAudioOutput).mockReturnValue({ volume: 0.8, muted: true });
    await playClip(drums);
    expect(tone.nodes).toHaveLength(0);
  });

  it('unlocks audio from a tap, and stays silent before one', async () => {
    vi.mocked(isAudioUnlocked).mockReturnValue(false);
    await playClip(drums);
    expect(unlockAudio).not.toHaveBeenCalled();
    expect(tone.nodes).toHaveLength(0);
    await playClip(drums, { fromGesture: true });
    expect(unlockAudio).toHaveBeenCalledTimes(1);
  });

  it('drops a clip overtaken while Tone loads', async () => {
    let loaded!: () => void;
    vi.mocked(loadTone).mockReturnValueOnce(
      new Promise((resolve) => (loaded = () => resolve(tone.Tone as never))),
    );
    const first = playClip(strum);
    const second = playClip(drums);
    loaded();
    await Promise.all([first, second]);
    expect(playProgression).not.toHaveBeenCalled();
    expect(tone.nodes.find((n) => n.kind === 'kick')).toBeDefined();
  });

  it('drops a clip stopped while it waits', async () => {
    const pending = playClip(strum);
    stopClip();
    await pending;
    expect(playProgression).not.toHaveBeenCalled();
  });
});
