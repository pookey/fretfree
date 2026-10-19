import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AUDIO } from './config';

/** Just enough of Tone to watch what the guitar plays and what the Transport holds. */
const fake = vi.hoisted(() => {
  const voices: FakePluck[] = [];
  class FakePluck {
    release = 1;
    attacks: [string, number, number][] = [];
    releases: [number, number][] = [];
    constructor(public opts: unknown) {
      voices.push(this);
    }
    connect() {
      return this;
    }
    triggerAttackRelease(note: string, duration: number, time: number) {
      this.attacks.push([note, duration, time]);
    }
    triggerRelease(time: number) {
      this.releases.push([time, this.release]);
    }
  }
  const output = { volume: { value: 0 }, mute: false };
  class FakeVolume {
    toDestination() {
      return output;
    }
  }
  class FakeFilter {
    connect() {
      return this;
    }
  }
  type Callback = (time: number) => void;
  const transport = {
    PPQ: 192,
    bpm: { value: 120 },
    position: 0 as number | string,
    loop: false,
    loopStart: 0 as number | string,
    loopEnd: 0 as number | string,
    events: new Map<number, { cb: Callback; at: string }>(),
    nextId: 0,
    schedule(cb: Callback, at: string) {
      const id = this.nextId++;
      this.events.set(id, { cb, at });
      return id;
    },
    clear(id: number) {
      this.events.delete(id);
    },
    start: vi.fn(),
    stop: vi.fn(),
    /** Run every event scheduled at `ticks`, at audio time `time`. */
    fire(ticks: number, time = 20) {
      for (const e of [...this.events.values()]) if (e.at === `${ticks}i`) e.cb(time);
    },
    ticks() {
      return [...this.events.values()].map((e) => Number.parseInt(e.at, 10));
    },
  };
  const ctx = { state: 'running' };
  return {
    voices,
    output,
    transport,
    ctx,
    start: vi.fn(async () => undefined),
    tone: {
      now: () => 10,
      getContext: () => ctx,
      getTransport: () => transport,
      getDraw: () => ({ schedule: (cb: () => void) => cb() }),
      PluckSynth: FakePluck,
      Volume: FakeVolume,
      Filter: FakeFilter,
    },
  };
});

vi.mock('tone', () => ({ ...fake.tone, start: fake.start }));

const allAttacks = () =>
  fake.voices.flatMap((v, voice) =>
    v.attacks.map(([note, dur, time]) => ({ note, dur, time, voice })),
  );

beforeEach(() => {
  vi.resetModules();
  fake.voices.length = 0;
  fake.output.volume.value = 0;
  fake.output.mute = false;
  fake.transport.events.clear();
  fake.transport.loop = false;
  fake.transport.start.mockClear();
  fake.transport.stop.mockClear();
  fake.start.mockClear();
  fake.ctx.state = 'running';
});

async function unlocked() {
  const audio = await import('./audio');
  await audio.unlockAudio();
  return audio;
}

describe('volume', () => {
  it('converts volume to decibels', async () => {
    const { volumeToDb } = await import('./audio');
    expect(volumeToDb(1)).toBe(0);
    expect(volumeToDb(0)).toBe(-Infinity);
    expect(volumeToDb(0.5)).toBeCloseTo(-6.02, 1);
    expect(volumeToDb(2)).toBe(0);
  });

  it('applies the master output once the guitar exists, and live after that', async () => {
    const audio = await unlocked();
    audio.setAudioOutput({ volume: 0.5 });
    expect(audio.getAudioOutput()).toEqual({ volume: 0.5, muted: false });
    await audio.playNotes(['A2']);
    expect(fake.output.volume.value).toBeCloseTo(-6.02, 1);
    audio.setAudioOutput({ muted: true });
    expect(fake.output.mute).toBe(true);
  });

  it('follows the sound settings from a store until unsubscribed', async () => {
    const audio = await unlocked();
    let listener: ((s: { settings: { soundOn: boolean; volume: number } }) => void) | null = null;
    const unsubscribe = vi.fn();
    const store = {
      getState: () => ({ settings: { soundOn: true, volume: 0.3 } }),
      subscribe: (l: typeof listener) => {
        listener = l;
        return unsubscribe;
      },
    };
    expect(audio.syncAudioOutput(store)).toBe(unsubscribe);
    expect(audio.getAudioOutput()).toEqual({ volume: 0.3, muted: false });
    listener!({ settings: { soundOn: false, volume: 0.3 } });
    expect(audio.getAudioOutput()).toEqual({ volume: 0.3, muted: true });
    // An unrelated settings change leaves the output alone.
    listener!({ settings: { soundOn: false, volume: 0.3 } });
    expect(audio.getAudioOutput().muted).toBe(true);
  });
});

describe('unlocking', () => {
  it('stays silent until unlocked, then plucks notes in sequence across strings', async () => {
    const audio = await import('./audio');
    await audio.playNotes(['A2']);
    expect(fake.voices).toHaveLength(0);
    await audio.unlockAudio();
    await audio.unlockAudio();
    expect(fake.start).toHaveBeenCalledTimes(1);
    expect(audio.isAudioUnlocked()).toBe(true);
    await audio.playNotes(['A2', 'E3'], { gap: 0.5 });
    expect(fake.voices).toHaveLength(AUDIO.voices);
    expect(allAttacks()).toEqual([
      { note: 'A2', dur: AUDIO.notes.duration, time: 10, voice: 0 },
      { note: 'E3', dur: AUDIO.notes.duration, time: 10.5, voice: 1 },
    ]);
  });

  it('plays the note of the tap that unlocks audio', async () => {
    const audio = await import('./audio');
    void audio.unlockAudio();
    await audio.playNotes(['A2']);
    expect(allAttacks()).toHaveLength(1);
  });

  it('can retry after the browser refuses', async () => {
    const audio = await import('./audio');
    fake.start.mockRejectedValueOnce(new Error('NotAllowedError'));
    await expect(audio.unlockAudio()).rejects.toThrow('NotAllowedError');
    expect(audio.isAudioUnlocked()).toBe(false);
    await audio.unlockAudio();
    expect(audio.isAudioUnlocked()).toBe(true);
  });

  it('unlocks once on the first interaction', async () => {
    const audio = await import('./audio');
    const target = new EventTarget() as unknown as Document;
    audio.installAudioUnlock(target);
    target.dispatchEvent(new Event('pointerdown'));
    target.dispatchEvent(new Event('pointerdown'));
    await vi.waitFor(() => expect(audio.isAudioUnlocked()).toBe(true));
    target.dispatchEvent(new Event('keydown'));
    expect(fake.start).toHaveBeenCalledTimes(1);
  });

  it('resumes a context the system suspended, on the next tap', async () => {
    const audio = await import('./audio');
    const target = new EventTarget() as unknown as Document;
    audio.installAudioUnlock(target);
    target.dispatchEvent(new Event('pointerdown'));
    await vi.waitFor(() => expect(audio.isAudioUnlocked()).toBe(true));
    fake.ctx.state = 'suspended';
    target.dispatchEvent(new Event('keydown'));
    // Resumed synchronously, inside the gesture.
    expect(fake.start).toHaveBeenCalledTimes(2);
    expect(audio.isAudioUnlocked()).toBe(false);
    await vi.waitFor(() => expect(audio.isAudioUnlocked()).toBe(true));
  });
});

describe('playNotes', () => {
  it('plays notes together on separate strings with no gap', async () => {
    const audio = await unlocked();
    await audio.playNotes(['A2', 'E3', 'A3'], { gap: 0, duration: 2 });
    expect(allAttacks().map((a) => [a.voice, a.time, a.dur])).toEqual([
      [0, 10, 2],
      [1, 10, 2],
      [2, 10, 2],
    ]);
  });

  it('respects a muted call and silent mode', async () => {
    const audio = await unlocked();
    await audio.playNotes(['A2'], { muted: true });
    audio.setAudioOutput({ muted: true });
    await audio.playNotes(['A2']);
    await audio.playNotes([]);
    expect(allAttacks()).toHaveLength(0);
  });

  it('sets the master volume from the call', async () => {
    const audio = await unlocked();
    await audio.playNotes(['A2'], { volume: 1 });
    expect(fake.output.volume.value).toBe(0);
    expect(audio.getAudioOutput().volume).toBe(1);
  });
});

describe('strum', () => {
  it('strums a chord low to high, one string per note', async () => {
    const audio = await unlocked();
    await audio.strum(['E3', 'A2', 'A3'], { gap: 0.02 });
    expect(allAttacks().map((a) => [a.note, a.voice, a.time, a.dur])).toEqual([
      ['A2', 0, 10, AUDIO.strum.duration],
      ['E3', 1, 10.02, AUDIO.strum.duration],
      ['A3', 2, 10.04, AUDIO.strum.duration],
    ]);
  });

  it('strums up from the top string', async () => {
    const audio = await unlocked();
    await audio.strum(['A2', 'E3', 'A3'], { direction: 'up', duration: 1 });
    expect(allAttacks().sort((a, b) => a.time - b.time)[0]?.note).toBe('A3');
  });

  it('is silent when muted or not unlocked', async () => {
    const audio = await import('./audio');
    await audio.strum(['A2', 'E3']);
    await audio.unlockAudio();
    await audio.strum(['A2', 'E3'], { muted: true });
    await audio.strum([]);
    expect(allAttacks()).toHaveLength(0);
  });
});

describe('playProgression', () => {
  const G = { notes: ['G2', 'B2', 'D3'] };
  const C = { notes: ['C3', 'E3', 'G3'] };

  it('schedules strokes and chord cues on the Transport, then ends', async () => {
    const audio = await unlocked();
    const onChord = vi.fn();
    const onEnd = vi.fn();
    const playback = await audio.playProgression([G, C], {
      bpm: 60,
      beatsPerChord: 2,
      onChord,
      onEnd,
    });
    expect(playback.started).toBe(true);
    expect(fake.transport.bpm.value).toBe(60);
    expect(fake.transport.start).toHaveBeenCalledWith(`+${AUDIO.progression.leadIn}`);
    // Strokes and cues at beats 0 and 2, and the end at beat 4.
    expect(fake.transport.ticks().sort((a, b) => a - b)).toEqual([0, 0, 384, 384, 768]);

    fake.transport.fire(0);
    expect(onChord).toHaveBeenLastCalledWith(0);
    expect(allAttacks().map((a) => [a.note, a.dur])).toEqual([
      ['G2', 2],
      ['B2', 2],
      ['D3', 2],
    ]);
    fake.transport.fire(384);
    expect(onChord).toHaveBeenLastCalledWith(1);

    fake.transport.fire(768);
    expect(onEnd).toHaveBeenCalledTimes(1);
    await playback.done;
    expect(fake.transport.events.size).toBe(0);
    // A natural end lets the last chord ring.
    expect(fake.voices.every((v) => v.releases.length === 0)).toBe(true);
    playback.stop();
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('times each stroke by the tempo at the moment it sounds', async () => {
    const audio = await unlocked();
    await audio.playProgression([G], { bpm: 60, beatsPerChord: 2 });
    fake.transport.bpm.value = 120;
    fake.transport.fire(0);
    expect(allAttacks()[0]?.dur).toBe(1);
  });

  it('loops until stopped, then damps the strings', async () => {
    const audio = await unlocked();
    const onEnd = vi.fn();
    const playback = await audio.playProgression([G, C], { loop: true, beatsPerChord: 1, onEnd });
    expect(fake.transport.loop).toBe(true);
    expect(fake.transport.loopEnd).toBe('384i');
    expect(fake.transport.ticks()).not.toContain(384);
    playback.stop();
    await playback.done;
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(fake.transport.loop).toBe(false);
    expect(fake.transport.events.size).toBe(0);
    expect(fake.voices.every((v) => v.releases.length === 1)).toBe(true);
    // Damping is quick, and the strings keep their natural release afterwards.
    expect(fake.voices[0]?.releases[0]?.[1]).toBeLessThan(0.1);
    expect(fake.voices[0]?.release).toBe(1);
  });

  it('stops the progression that was playing when another starts', async () => {
    const audio = await unlocked();
    const first = await audio.playProgression([G]);
    const second = await audio.playProgression([C]);
    await first.done;
    expect(second.started).toBe(true);
    audio.stopAudio();
    await second.done;
    expect(fake.transport.events.size).toBe(0);
  });

  it('strums an up-stroke on the top strings', async () => {
    const audio = await unlocked();
    await audio.playProgression([{ notes: ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'] }], {
      pattern: 'eighths',
      beatsPerChord: 1,
      upStrings: 2,
    });
    fake.transport.fire(96);
    expect(allAttacks().map((a) => a.note)).toEqual(['B3', 'E4']);
  });

  it('runs in silent mode, so chord cues still fire', async () => {
    const audio = await unlocked();
    audio.setAudioOutput({ muted: true });
    const onChord = vi.fn();
    const playback = await audio.playProgression([G], { onChord });
    expect(playback.started).toBe(true);
    expect(fake.output.mute).toBe(true);
    fake.transport.fire(0);
    expect(onChord).toHaveBeenCalledWith(0);
  });

  it('does not start before audio is unlocked, or with nothing to play', async () => {
    const audio = await import('./audio');
    expect((await audio.playProgression([G])).started).toBe(false);
    await audio.unlockAudio();
    expect((await audio.playProgression([])).started).toBe(false);
    expect(fake.transport.start).not.toHaveBeenCalled();
  });

  it('rejects a bad tempo before touching the Transport', async () => {
    const audio = await unlocked();
    await expect(audio.playProgression([G], { bpm: 0 })).rejects.toThrow(RangeError);
    expect(fake.transport.start).not.toHaveBeenCalled();
  });

  it('stopAudio without a progression damps the strings', async () => {
    const audio = await unlocked();
    audio.stopAudio();
    await audio.playNotes(['A2']);
    audio.stopAudio();
    expect(fake.voices.every((v) => v.releases.length === 1)).toBe(true);
  });
});
