import { beforeEach, describe, expect, it, vi } from 'vitest';
import { METER_PRESETS } from './meter';
import type { Click } from './metronome';

/** Just enough of Tone: a Transport whose repeat fires on demand, a Draw queue and a synth. */
const fake = vi.hoisted(() => {
  type Callback = (time: number) => void;
  const synths: { attacks: [number, number, number, number][] }[] = [];
  class FakeSynth {
    attacks: [number, number, number, number][] = [];
    constructor(public opts: unknown) {
      synths.push(this);
    }
    connect() {
      return this;
    }
    triggerAttackRelease(hz: number, duration: number, time: number, velocity: number) {
      this.attacks.push([hz, duration, time, velocity]);
    }
  }
  const out = { volume: { value: 0 } };
  class FakeVolume {
    toDestination() {
      return out;
    }
  }
  const transport = {
    PPQ: 192,
    bpm: {
      value: 120,
      setValueAtTime: vi.fn(),
      cancelScheduledValues: vi.fn(),
    },
    position: 0 as number | string,
    loop: true,
    repeats: new Map<number, { cb: Callback; interval: string }>(),
    nextId: 1,
    scheduleRepeat(cb: Callback, interval: string) {
      const id = this.nextId++;
      this.repeats.set(id, { cb, interval });
      return id;
    },
    clear(id: number) {
      this.repeats.delete(id);
    },
    start: vi.fn(),
    stop: vi.fn(),
    /** Fire every repeat once at audio time `time` (seconds). */
    tick(time: number) {
      for (const r of [...this.repeats.values()]) r.cb(time);
    },
  };
  const drawQueue: (() => void)[] = [];
  const clock = { now: 10 };
  return {
    synths,
    out,
    transport,
    drawQueue,
    clock,
    start: vi.fn(async () => undefined),
    tone: {
      now: () => clock.now,
      getContext: () => ({ state: 'running' }),
      getTransport: () => transport,
      getDraw: () => ({ schedule: (cb: () => void) => drawQueue.push(cb) }),
      Synth: FakeSynth,
      Volume: FakeVolume,
    },
  };
});

vi.mock('tone', () => ({ ...fake.tone, start: fake.start }));

beforeEach(() => {
  vi.resetModules();
  fake.synths.length = 0;
  fake.transport.repeats.clear();
  fake.transport.start.mockClear();
  fake.transport.stop.mockClear();
  fake.transport.bpm.setValueAtTime.mockClear();
  fake.drawQueue.length = 0;
  fake.clock.now = 10;
  fake.start.mockClear();
});

async function load() {
  const audio = await import('../audio/audio');
  const transport = await import('../audio/transport');
  const { createMetronome, getMetronome } = await import('./metronome');
  return { audio, transport, metronome: createMetronome(), getMetronome };
}

const four = { meter: METER_PRESETS['4/4'], bpm: 120 };

describe('createMetronome', () => {
  it('unlocks audio, claims the Transport and starts just past the scheduler horizon', async () => {
    const { metronome, transport } = await load();
    expect(await metronome.start(four)).toBe(true);
    expect(fake.start).toHaveBeenCalled();
    expect(metronome.running).toBe(true);
    expect(transport.transportOwner()).toBe('metronome');
    expect(fake.transport.loop).toBe(false);
    expect(fake.transport.position).toBe(0);
    expect(fake.transport.bpm.value).toBe(120);
    expect(fake.transport.start).toHaveBeenCalledWith(10.05);
    expect([...fake.transport.repeats.values()][0]!.interval).toBe('192i');
    // A bar of count-in: pulse 0 is four beats after the first click.
    expect(metronome.timeAtPulse(-4)).toBeCloseTo(10050, 6);
    expect(metronome.timeAtPulse(0)).toBeCloseTo(12050, 6);
    expect(metronome.pulseAtTime(12300)).toBeCloseTo(0.5, 6);
    expect(metronome.layout).toEqual({ meter: four.meter, subdivide: 1, countInBars: 1 });
  });

  it('sounds each click with its accent and reports it, then on its frame', async () => {
    const { metronome } = await load();
    const scheduled: Click[] = [];
    const lit: number[] = [];
    metronome.onClick((c) => scheduled.push(c));
    metronome.onBeat((c) => lit.push(c.index));
    await metronome.start({ ...four, countInBars: 0, subdivide: 2 });
    expect([...fake.transport.repeats.values()][0]!.interval).toBe('96i');
    fake.transport.tick(10.05);
    fake.transport.tick(10.3);
    fake.transport.tick(10.55);
    expect(scheduled.map((c) => [c.accent, c.at, c.audible])).toEqual([
      ['bar', 10050, true],
      ['sub', 10300, true],
      ['pulse', 10550, true],
    ]);
    const hz = fake.synths[0]!.attacks.map(([h, , time, velocity]) => [h, time, velocity]);
    expect(hz).toEqual([
      [1568, 10.05, 1],
      [660, 10.3, 0.35],
      [880, 10.55, 0.6],
    ]);
    expect(lit).toEqual([]);
    fake.drawQueue.splice(0).forEach((cb) => cb());
    expect(lit).toEqual([0, 1, 2]);
  });

  it('drops faded clicks from the sound but still reports them, and fades live', async () => {
    const { metronome } = await load();
    const scheduled: Click[] = [];
    metronome.onClick((c) => scheduled.push(c));
    await metronome.start({ ...four, countInBars: 1, fade: { keep: 'bars' } });
    for (let i = 0; i < 8; i += 1) fake.transport.tick(10 + i * 0.5);
    // The count-in sounds in full; after it only the downbeat.
    expect(scheduled.map((c) => c.audible)).toEqual([
      true,
      true,
      true,
      true,
      true,
      false,
      false,
      false,
    ]);
    expect(fake.synths[0]!.attacks).toHaveLength(5);
    metronome.setFade((click) => click.pulseInBar === 2);
    for (let i = 8; i < 12; i += 1) fake.transport.tick(10 + i * 0.5);
    expect(scheduled.slice(8).map((c) => c.audible)).toEqual([false, false, true, false]);
  });

  it('respects silent mode and the master volume', async () => {
    const { metronome, audio } = await load();
    await metronome.start(four);
    audio.setAudioOutput({ volume: 0.5 });
    fake.transport.tick(10.05);
    expect(fake.out.volume.value).toBeCloseTo(-6.02, 1);
    audio.setAudioOutput({ muted: true });
    fake.transport.tick(10.55);
    expect(fake.synths[0]!.attacks).toHaveLength(1);
    audio.setAudioOutput({ muted: false, volume: 0.8 });
  });

  it('changes tempo from the first pulse the Transport has not scheduled', async () => {
    const { metronome } = await load();
    await metronome.start({ ...four, countInBars: 0 });
    // Pulse 0 at 10.05s; 500ms a pulse. The horizon is now + 50ms.
    fake.clock.now = 11.2;
    expect(metronome.setTempo(60)).toBe(3);
    expect(fake.transport.bpm.setValueAtTime).toHaveBeenCalledWith(60, 11.55);
    expect(metronome.timeAtPulse(4)).toBeCloseTo(12550, 6);
    expect(metronome.tempo.map((s) => s.bpm)).toEqual([120, 60]);
    expect(() => metronome.setTempo(0)).toThrow(RangeError);
  });

  it('stops: clears its events, gives the Transport back and says so', async () => {
    const { metronome, transport } = await load();
    const stopped = vi.fn();
    metronome.onStop(stopped);
    await metronome.start(four);
    metronome.stop();
    expect(metronome.running).toBe(false);
    expect(fake.transport.repeats.size).toBe(0);
    expect(fake.transport.stop).toHaveBeenCalled();
    expect(transport.transportOwner()).toBeNull();
    expect(stopped).toHaveBeenCalledTimes(1);
    expect(metronome.setTempo(90)).toBeNull();
    expect(metronome.timeAtPulse(0)).toBeNull();
    expect(metronome.pulseAtTime(0)).toBeNull();
    expect(metronome.tempo).toEqual([]);
    expect(metronome.layout).toBeNull();
    metronome.stop();
    expect(stopped).toHaveBeenCalledTimes(1);
  });

  it('does not light a beat queued before it stopped', async () => {
    const { metronome } = await load();
    const lit = vi.fn();
    metronome.onBeat(lit);
    await metronome.start(four);
    fake.transport.tick(10.05);
    metronome.stop();
    fake.drawQueue.splice(0).forEach((cb) => cb());
    expect(lit).not.toHaveBeenCalled();
  });

  it('stops when a progression claims the Transport', async () => {
    const { metronome, transport } = await load();
    const stopped = vi.fn();
    metronome.onStop(stopped);
    await metronome.start(four);
    const lease = transport.claimTransport('progression', () => undefined);
    expect(metronome.running).toBe(false);
    expect(stopped).toHaveBeenCalled();
    lease.release();
  });

  it('a second start replaces the first run', async () => {
    const { metronome } = await load();
    await metronome.start(four);
    await metronome.start({ ...four, bpm: 90 });
    expect(fake.transport.repeats.size).toBe(1);
    expect(metronome.tempo[0]!.bpm).toBe(90);
  });

  it('does not start when audio stays locked, or a stop overtakes it', async () => {
    const { metronome } = await load();
    fake.start.mockRejectedValueOnce(new Error('NotAllowedError'));
    expect(await metronome.start(four)).toBe(false);
    expect(metronome.running).toBe(false);
    const pending = metronome.start(four);
    metronome.stop();
    expect(await pending).toBe(false);
    expect(metronome.running).toBe(false);
  });

  it('rejects a bad tempo or layout before touching anything', async () => {
    const { metronome } = await load();
    await expect(metronome.start({ ...four, bpm: -1 })).rejects.toThrow(RangeError);
    await expect(metronome.start({ ...four, subdivide: 7 })).rejects.toThrow(RangeError);
    expect(fake.start).not.toHaveBeenCalled();
  });

  it('shares one app metronome', async () => {
    const { getMetronome } = await load();
    expect(getMetronome()).toBe(getMetronome());
  });
});
