import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AUDIO } from './config';

/** Just enough of Tone and the guitar to watch what plays and what the Transport holds. */
const fake = vi.hoisted(() => {
  const guitar = {
    output: { volume: { value: 0 }, mute: false },
    plucks: [] as { note: string; dur: number; time: number; voice: number }[],
    damps: [] as number[],
    pluck(note: string, time: number, dur: number, voice: number) {
      this.plucks.push({ note, dur, time, voice });
    },
    damp(time: number) {
      this.damps.push(time);
    },
  };
  const output = guitar.output;
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
  /** Draw runs its callbacks on an animation frame; `flushDraw` is that frame. */
  const drawQueue: (() => void)[] = [];
  const flushDraw = () => drawQueue.splice(0).forEach((cb) => cb());
  const ctx = { state: 'running' };
  return {
    guitar,
    createGuitar: vi.fn(() => guitar),
    setContext: vi.fn(),
    output,
    drawQueue,
    flushDraw,
    transport,
    ctx,
    start: vi.fn(async () => undefined),
    tone: {
      now: () => 10,
      getContext: () => ctx,
      getTransport: () => transport,
      getDraw: () => ({ schedule: (cb: () => void) => drawQueue.push(cb) }),
    },
  };
});

vi.mock('tone', () => ({ ...fake.tone, start: fake.start, setContext: fake.setContext }));
vi.mock('./voice', () => ({ createGuitar: fake.createGuitar }));

const allAttacks = () => fake.guitar.plucks;

beforeEach(() => {
  vi.resetModules();
  fake.guitar.plucks.length = 0;
  fake.guitar.damps.length = 0;
  fake.createGuitar.mockClear();
  fake.setContext.mockClear();
  fake.output.volume.value = 0;
  fake.output.mute = false;
  fake.transport.events.clear();
  fake.transport.loop = false;
  fake.transport.start.mockClear();
  fake.transport.stop.mockClear();
  fake.drawQueue.length = 0;
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
    expect(fake.createGuitar).not.toHaveBeenCalled();
    await audio.unlockAudio();
    await audio.unlockAudio();
    expect(fake.start).toHaveBeenCalledTimes(1);
    expect(audio.isAudioUnlocked()).toBe(true);
    await audio.playNotes(['A2', 'E3'], { gap: 0.5 });
    expect(fake.createGuitar).toHaveBeenCalledTimes(1);
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

  it('unlocks on the first interaction, then leaves a running context alone', async () => {
    const audio = await import('./audio');
    const target = new EventTarget() as unknown as Document;
    audio.installAudioUnlock(target);
    target.dispatchEvent(new Event('pointerdown'));
    await vi.waitFor(() => expect(audio.isAudioUnlocked()).toBe(true));
    target.dispatchEvent(new Event('pointerup'));
    target.dispatchEvent(new Event('keydown'));
    expect(fake.start).toHaveBeenCalledTimes(1);
  });

  it('asks again inside each gesture until the browser starts audio', async () => {
    const audio = await unlocked();
    const target = new EventTarget() as unknown as Document;
    audio.installAudioUnlock(target);
    fake.ctx.state = 'suspended';
    // iOS refuses a touch's pointerdown and allows its pointerup.
    fake.start.mockRejectedValueOnce(new Error('NotAllowedError'));
    target.dispatchEvent(new Event('pointerdown'));
    target.dispatchEvent(new Event('pointerup'));
    // Both asked synchronously, inside their own gesture.
    expect(fake.start).toHaveBeenCalledTimes(3);
    await vi.waitFor(() => expect(audio.isAudioUnlocked()).toBe(true));
    await audio.playNotes(['A2']);
    expect(allAttacks()).toHaveLength(1);
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

describe('the first tap', () => {
  /** A native context, as the browser makes it. */
  class FakeAudioContext {
    static made: FakeAudioContext[] = [];
    sampleRate = 48_000;
    destination = {};
    resume = vi.fn(async () => undefined);
    blips: { buffer: unknown; started: number | null; to: unknown }[] = [];
    constructor() {
      FakeAudioContext.made.push(this);
    }
    createBuffer(channels: number, length: number) {
      return { channels, length };
    }
    createBufferSource() {
      const blip = { buffer: null as unknown, started: null as number | null, to: null as unknown };
      this.blips.push(blip);
      return {
        set buffer(b: unknown) {
          blip.buffer = b;
        },
        connect: (to: unknown) => (blip.to = to),
        start: (at: number) => (blip.started = at),
      };
    }
  }

  beforeEach(() => {
    FakeAudioContext.made = [];
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('starts a context inside the gesture, before Tone has loaded, and hands it to Tone', async () => {
    vi.stubGlobal('AudioContext', FakeAudioContext);
    const audio = await import('./audio');
    const unlocking = audio.unlockAudio();
    // All of this happened synchronously, inside the tap.
    const [context] = FakeAudioContext.made;
    expect(FakeAudioContext.made).toHaveLength(1);
    expect(context?.resume).toHaveBeenCalledTimes(1);
    expect(context?.blips).toEqual([
      { buffer: { channels: 1, length: 1 }, started: 0, to: context?.destination },
    ]);
    expect(fake.setContext).not.toHaveBeenCalled();
    // A second event of the same tap (its click, say) asks the same context again.
    const again = audio.unlockAudio();
    expect(FakeAudioContext.made).toHaveLength(1);
    expect(context?.resume).toHaveBeenCalledTimes(2);

    await Promise.all([unlocking, again]);
    expect(fake.setContext).toHaveBeenCalledTimes(1);
    expect(fake.setContext).toHaveBeenCalledWith(context, true);
    expect(audio.isAudioUnlocked()).toBe(true);
  });

  it('falls back to the prefixed constructor', async () => {
    vi.stubGlobal('webkitAudioContext', FakeAudioContext);
    const audio = await import('./audio');
    await audio.unlockAudio();
    expect(FakeAudioContext.made).toHaveLength(1);
    expect(fake.setContext).toHaveBeenCalledTimes(1);
  });

  it("leaves Tone's own context when the browser has none or refuses one", async () => {
    const audio = await import('./audio');
    await audio.unlockAudio();
    expect(fake.setContext).not.toHaveBeenCalled();

    vi.resetModules();
    vi.stubGlobal(
      'AudioContext',
      class {
        constructor() {
          throw new Error('NotSupportedError');
        }
      },
    );
    const refused = await import('./audio');
    await refused.unlockAudio();
    expect(fake.setContext).not.toHaveBeenCalled();
    expect(refused.isAudioUnlocked()).toBe(true);
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
    fake.flushDraw();
    expect(onChord).toHaveBeenLastCalledWith(0);
    expect(allAttacks().map((a) => [a.note, a.dur])).toEqual([
      ['G2', 2],
      ['B2', 2],
      ['D3', 2],
    ]);
    fake.transport.fire(384);
    fake.flushDraw();
    expect(onChord).toHaveBeenLastCalledWith(1);

    // The Transport is released on its own clock, without waiting for a frame
    // (which never comes in a hidden tab); only the UI's onEnd waits for one.
    fake.transport.fire(768, 23);
    await playback.done;
    expect(fake.transport.stop).toHaveBeenLastCalledWith(23);
    expect(fake.transport.events.size).toBe(0);
    expect(onEnd).not.toHaveBeenCalled();
    fake.flushDraw();
    expect(onEnd).toHaveBeenCalledTimes(1);
    // A natural end lets the last chord ring.
    expect(fake.guitar.damps).toEqual([]);
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
    expect(fake.guitar.damps).toEqual([10]);
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

  it('drops a chord cue still waiting for its frame when stopped', async () => {
    const audio = await unlocked();
    const onChord = vi.fn();
    const onEnd = vi.fn();
    const playback = await audio.playProgression([G, C], { onChord, onEnd });
    fake.transport.fire(0);
    playback.stop();
    expect(onEnd).toHaveBeenCalledTimes(1);
    fake.flushDraw();
    expect(onChord).not.toHaveBeenCalled();
  });

  it('lets only the latest of two overlapping starts play', async () => {
    const audio = await unlocked();
    const first = audio.playProgression([G], { loop: true });
    const second = await audio.playProgression([C]);
    expect((await first).started).toBe(false);
    await (
      await first
    ).done;
    expect(second.started).toBe(true);
    expect(fake.transport.start).toHaveBeenCalledTimes(1);
    fake.transport.fire(0);
    expect(allAttacks().map((a) => a.note)).toEqual(C.notes);
    expect(fake.transport.loop).toBe(false);
    second.stop();
    await second.done;
    expect(fake.transport.events.size).toBe(0);
  });

  it('cancels a start still waiting when stopAudio is called', async () => {
    const audio = await unlocked();
    const pending = audio.playProgression([G], { loop: true });
    audio.stopAudio();
    expect((await pending).started).toBe(false);
    expect(fake.transport.start).not.toHaveBeenCalled();
    expect(fake.transport.events.size).toBe(0);
  });

  it('settles overlapping starts and stops made while the first tap unlocks', async () => {
    const audio = await import('./audio');
    void audio.unlockAudio();
    const first = audio.playProgression([G], { loop: true });
    const second = audio.playProgression([C]);
    expect((await first).started).toBe(false);
    expect((await second).started).toBe(true);
    fake.transport.fire(0);
    expect(allAttacks().map((a) => a.note)).toEqual(C.notes);

    const third = audio.playProgression([G], { loop: true });
    audio.stopAudio();
    expect((await third).started).toBe(false);
    await (
      await second
    ).done;
    expect(fake.transport.events.size).toBe(0);
    expect(fake.transport.start).toHaveBeenCalledTimes(1);
  });

  it('strums an up-stroke on the top strings', async () => {
    const audio = await unlocked();
    await audio.playProgression([{ notes: ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'] }], {
      pattern: 'eighths',
      beatsPerChord: 1,
      upStrings: 2,
    });
    fake.transport.fire(96);
    expect(allAttacks().map((a) => a.note)).toEqual(['E4', 'B3']);
  });

  it('runs in silent mode, so chord cues still fire', async () => {
    const audio = await unlocked();
    audio.setAudioOutput({ muted: true });
    const onChord = vi.fn();
    const playback = await audio.playProgression([G], { onChord });
    expect(playback.started).toBe(true);
    expect(fake.output.mute).toBe(true);
    fake.transport.fire(0);
    fake.flushDraw();
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
    expect(fake.guitar.damps).toEqual([10]);
  });
});
